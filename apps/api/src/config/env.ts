export function validateEnvironment() {
  if (!/^mongodb(?:\+srv)?:\/\//.test(process.env.MONGODB_URI || '')) throw new Error('Set MONGODB_URI to an Atlas or replica-set connection string.');
  if (Buffer.byteLength(process.env.JWT_SECRET || '') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes.');
  const publicUrl = new URL(process.env.PUBLIC_BASE_URL || 'http://localhost:4000');
  if (process.env.NODE_ENV === 'production' && publicUrl.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use HTTPS in production.');
  if (process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) throw new Error('Only Razorpay test keys are supported.');
  const paymentKeys = ['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET'].filter(k=>Boolean(process.env[k]));
  if (paymentKeys.length > 0 && paymentKeys.length !== 3) throw new Error('Configure all three Razorpay test credentials together.');
}
