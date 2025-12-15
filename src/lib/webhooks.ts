import axios from 'axios';

interface WebhookPayload {
  [key: string]: any;
}

export const sendWebhookEvent = async (eventType: string, data: WebhookPayload) => {
  const ghlWebhookUrl = process.env.GHL_WEBHOOK_URL;
  
  if (!ghlWebhookUrl) {
    console.log(`GHL webhook URL not configured, skipping ${eventType} event`);
    return;
  }

  try {
    const payload = {
      event_type: eventType,
      data,
      timestamp: new Date().toISOString(),
      source: 'property-booking-system',
    };

    await axios.post(ghlWebhookUrl, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Property-Booking-System/1.0',
      },
    });

    console.log(`Successfully sent ${eventType} webhook to GHL`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Failed to send ${eventType} webhook to GHL:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
    } else {
      console.error(`Error sending ${eventType} webhook:`, error);
    }
    
    // In production, you might want to implement retry logic or queue failed webhooks
    // For now, we just log the error and continue
  }
};

// Example usage for other integrations
export const sendToExternalService = async (serviceUrl: string, payload: WebhookPayload) => {
  try {
    await axios.post(serviceUrl, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Property-Booking-System/1.0',
      },
    });

    console.log(`Successfully sent payload to ${serviceUrl}`);
  } catch (error) {
    console.error(`Failed to send payload to ${serviceUrl}:`, error);
    throw error;
  }
};
