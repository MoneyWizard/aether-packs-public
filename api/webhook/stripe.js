const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const resend = new Resend(process.env.EMAIL_API_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

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
      console.log(`[Fulfillment] Dispatching transactional email via Resend...`);
      
      try {
        await resend.emails.send({
          from: 'fulfillment@aetherpacks.com', // Must be a verified domain in Resend
          to: email,
          subject: 'Your Aether Packs Download',
          html: `
            <h1>Welcome to Aether Packs!</h1>
            <p>Thank you for your purchase. Your payment has been securely processed.</p>
            <p>You can download your zero-install operator toolkit right here:</p>
            <a href="https://aether-packs-public.vercel.app/downloads/aether-packs.zip" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Download Toolkit</a>
            <p>If you prefer access to the private Git vault for ongoing source code updates, please reply to this email with your GitHub username!</p>
          `
        });
        console.log(`[Fulfillment] Success! Digital asset securely dispatched to ${email}.`);
      } catch (emailError) {
        console.error(`[Fulfillment] Failed to send email: ${emailError.message}`);
      }
    } else {
      console.warn(`[Fulfillment] Checkout completed but no email found in customer_details.`);
    }
  }

  res.json({ received: true });
}
