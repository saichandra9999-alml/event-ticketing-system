const crypto = require('crypto');

/**
 * Process a simulated payment transaction (No real money or external payment API calls)
 * @param {object} params
 * @param {number} params.amount - Total payment amount
 * @param {string} [params.paymentMethod='CARD'] - CARD, UPI, NET_BANKING
 * @param {boolean} [params.simulateFailure=false] - Development test flag to simulate payment decline
 * @returns {object} Payment result with status and transactionId
 */
const processSimulatedPayment = async ({ amount, paymentMethod = 'CARD', simulateFailure = false }) => {
  // Generate unique fake transaction ID
  const randomHash = crypto.randomBytes(4).toString('hex').toUpperCase();
  const transactionId = `TXN_SIM_${Date.now()}_${randomHash}`;

  const validMethods = ['CARD', 'UPI', 'NET_BANKING'];
  const normalizedMethod = validMethods.includes(paymentMethod.toUpperCase())
    ? paymentMethod.toUpperCase()
    : 'CARD';

  if (simulateFailure) {
    return {
      success: false,
      status: 'FAILED',
      transactionId,
      amount,
      currency: 'USD',
      paymentMethod: normalizedMethod,
      message: 'Demo Payment declined by issuing bank (Simulated Failure)',
    };
  }

  return {
    success: true,
    status: 'SUCCESS',
    transactionId,
    amount,
    currency: 'USD',
    paymentMethod: normalizedMethod,
    message: 'Demo Payment processed successfully',
  };
};

module.exports = {
  processSimulatedPayment,
};
