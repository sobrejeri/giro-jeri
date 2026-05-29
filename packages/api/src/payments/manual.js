// Manual gateway — no external API call needed.
// Returns a local identifier so the operator is marked as "registered".
export async function createRecipient(user) {
  return `manual_${user.id}`
}
