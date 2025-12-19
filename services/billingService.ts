import prisma from '../prisma/client';
import { config } from '../config';
import logger from '../lib/logger';

type PlanName = 'free' | 'pro';

type PlanConfig = {
  name: PlanName;
  monthlyAsinQuota: number;
  maxBatchSize: number;
  price: number;
  description: string;
};

const plans: Record<PlanName, PlanConfig> = {
  free: {
    name: 'free',
    monthlyAsinQuota: 300,
    maxBatchSize: 20,
    price: 0,
    description: 'Starter plan with limited batch analysis.'
  },
  pro: {
    name: 'pro',
    monthlyAsinQuota: 5000,
    maxBatchSize: 100,
    price: 99,
    description: 'Full access to batch analysis with higher limits.'
  }
};

export const getPlanConfig = (plan?: string | null): PlanConfig => {
  if (plan === 'pro') return plans.pro;
  return plans.free;
};

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const getUsage = async (organizationId: string) => {
  const month = currentMonthKey();
  let usage = await prisma.organizationUsage.findUnique({
    where: { organizationId_month: { organizationId, month } }
  });
  if (!usage) {
    usage = await prisma.organizationUsage.create({
      data: { organizationId, month }
    });
  }
  return usage;
};

export const consumeBatchUsage = async (organizationId: string, asinCount: number) => {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const plan = getPlanConfig(org?.plan);
  if (asinCount > plan.maxBatchSize) {
    throw new Error(`Batch size exceeds plan limit (${plan.maxBatchSize})`);
  }

  const usage = await getUsage(organizationId);
  if (usage.asinsAnalyzed + asinCount > plan.monthlyAsinQuota) {
    throw new Error('Monthly ASIN quota exceeded. Upgrade plan to continue.');
  }

  await prisma.organizationUsage.update({
    where: { id: usage.id },
    data: {
      asinsAnalyzed: { increment: asinCount },
      batchRuns: { increment: 1 }
    }
  });
};

export const setOrganizationPlan = async (organizationId: string, plan: PlanName, stripeData?: { customerId?: string; subscriptionId?: string; currentPeriodEnd?: number }) => {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan,
      stripeCustomerId: stripeData?.customerId,
      stripeSubscriptionId: stripeData?.subscriptionId,
      planRenewsAt: stripeData?.currentPeriodEnd ? new Date(stripeData.currentPeriodEnd * 1000) : undefined
    }
  });
};

export const plansPublic = () =>
  Object.values(plans).map((p) => ({
    name: p.name,
    monthlyAsinQuota: p.monthlyAsinQuota,
    maxBatchSize: p.maxBatchSize,
    price: p.price,
    description: p.description
  }));

export const requireOwnerOrAdmin = (role?: string | null) => {
  return role === 'owner' || role === 'admin';
};

export const getStripeClient = () => {
  if (!config.stripeSecretKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Stripe = require('stripe');
  return new Stripe(config.stripeSecretKey, { apiVersion: '2023-10-16' });
};

export const createCheckoutSession = async (opts: { organizationId: string; userEmail?: string }) => {
  const stripe = getStripeClient();
  if (!stripe || !config.stripePricePro) {
    throw new Error('Stripe not configured');
  }

  const org = await prisma.organization.findUnique({ where: { id: opts.organizationId } });
  const customer = org?.stripeCustomerId
    ? org.stripeCustomerId
    : (
        await stripe.customers.create({
          email: opts.userEmail,
          metadata: { organizationId: opts.organizationId }
        })
      ).id;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: config.stripePricePro, quantity: 1 }],
    success_url: `${config.frontendUrl}/billing/success`,
    cancel_url: `${config.frontendUrl}/billing/cancel`,
    subscription_data: {
      metadata: { organizationId: opts.organizationId }
    },
    metadata: { organizationId: opts.organizationId }
  });

  if (!org?.stripeCustomerId) {
    await prisma.organization.update({
      where: { id: opts.organizationId },
      data: { stripeCustomerId: customer }
    });
  }

  return session;
};

export const handleStripeWebhook = async (event: any) => {
  const type = event.type;
  const data = event.data?.object;

  const organizationId = data?.metadata?.organizationId || data?.subscription_metadata?.organizationId || data?.object?.metadata?.organizationId;
  if (!organizationId) {
    logger.warn('Stripe webhook missing organizationId', { type });
    return;
  }

  if (type === 'checkout.session.completed') {
    await setOrganizationPlan(organizationId, 'pro', {
      customerId: data.customer as string,
      subscriptionId: data.subscription as string
    });
    return;
  }

  if (type === 'customer.subscription.deleted') {
    await setOrganizationPlan(organizationId, 'free', {
      customerId: data.customer as string,
      subscriptionId: data.id as string
    });
    return;
  }

  if (type === 'customer.subscription.updated') {
    const priceId = data.items?.data?.[0]?.price?.id;
    const plan = priceId === config.stripePricePro ? 'pro' : 'free';
    await setOrganizationPlan(organizationId, plan, {
      customerId: data.customer as string,
      subscriptionId: data.id as string,
      currentPeriodEnd: data.current_period_end
    });
    return;
  }
};
