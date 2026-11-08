export type BanMessage = {
  offense: 'warned' | 'banned';
  reason: string;
  ban: boolean;
  warn: boolean;
  expiration: string;
  expired: number | false;
};

export async function fetchBanMessage(): Promise<BanMessage> {
  const response = await fetch("/banned");
  return await response.json();
}
