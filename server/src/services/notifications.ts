type NotificationEvent = 'payment_succeeded' | 'order_ready' | 'reservation_expired';

export class NotificationService {
  publish(event: NotificationEvent) {
    console.info('FoodShare notification %s', event);
  }
}

export const notifications = new NotificationService();
