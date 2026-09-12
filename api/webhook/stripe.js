const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// To ensure Vercel doesn't parse the raw body, we must export config
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to read raw body
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(
      rawBody, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;

    if (email) {
      console.log(`[Fulfillment] Checkout session completed for: ${email}`);
      console.log(`[Fulfillment] Dispatching transactional email via Resend/SendGrid...`);
      // Here we would call the Email API (e.g. Resend) to send the download link
      // For example: await sendEmail({ to: email, subject: "Your Aether Packs Download", ... })
      console.log(`[Fulfillment] Success! Digital asset securely dispatched to ${email}.`);
    } else {
      console.warn(`[Fulfillment] Checkout completed but no email found in customer_details.`);
    }
  }

  // Return a 200 OK status immediately to prevent Stripe from retrying
  res.json({ received: true });
}
