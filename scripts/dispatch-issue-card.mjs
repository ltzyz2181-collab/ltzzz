const reservedFamilies = ['fund', 'payment', 'refund', 'signature', 'safe_multisig'];
const importanceLevels = {
  high: 'high',
  medium: 'medium',
  low: 'low'
};

function isReservedFamily(text) {
  const regex = new RegExp(`\\b(${reservedFamilies.join('|')})\\b`, 'i');
  return regex.test(text);
}

function getImportanceLevel(prompt) {
  if (prompt.includes('[P1]')) {
    return importanceLevels.high;
  }
  // Add more conditions for other levels as needed
  return importanceLevels.medium; // Default to medium if no specific level is found
}

function shouldBlockCard(prompt, dataClassification) {
  if (isReservedFamily(prompt)) {
    return true;
  }
  if (dataClassification === 'public_distributable' && prompt.includes('workflow/config changes')) {
    return false; // Allow ordinary workflow/config changes
  }
  // Add more conditions for other blocking criteria as needed
  return false;
}

module.exports = {
  isReservedFamily,
  getImportanceLevel,
  shouldBlockCard
};