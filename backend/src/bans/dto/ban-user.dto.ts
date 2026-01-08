export class BanUserDto {
  userId!: string;
  scope!: 'ALL' | 'BOOKINGS' | 'PAYOUTS' | 'MESSAGING';
  reason!: string;
  note?: string;
}
