export type WaitlistMailRecipient = {
  email: string;
  joinedAt: Date | string;
};

export function mergeWaitlistMessage(template: string, recipient: WaitlistMailRecipient) {
  const joinedAt = new Date(recipient.joinedAt);
  if (Number.isNaN(joinedAt.getTime())) {
    throw new Error("Waitlist recipient has an invalid joined date.");
  }
  const values: Record<string, string> = {
    email: recipient.email,
    joinedAt: joinedAt.toLocaleString(),
    joinedDate: joinedAt.toLocaleDateString(),
  };
  return template.replace(/\{\{(email|joinedAt|joinedDate)\}\}/g, (_, key: keyof typeof values) => values[key]);
}
