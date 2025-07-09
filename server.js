const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");

const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Validar variables de entorno
if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
  console.error("❌ STRIPE_SECRET_KEY inválida o faltante");
  process.exit(1);
}

const app = express();

// SOLUCIÓN AL ERROR: Configuración de CORS sin wildcards
app.use(
  cors({
    origin: [
      "https://refereence.io",
      "https://stripe-m1l8.onrender.com",
      "https://iodized-delicate-jupiter.glitch.me",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:8080",
      "http://localhost:5000",
      "http://127.0.0.1:5500"
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middleware para logging de solicitudes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Manejo diferenciado de bodies
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// Endpoints
app.get("/", (req, res) => {
  res.json({ message: "Servidor Stripe funcionando" });
});

app.get("/stripe-key", (req, res) => {
  if (!stripePublishableKey) {
    return res.status(500).json({ error: "Stripe key no configurada" });
  }
  res.json({ publishableKey: stripePublishableKey });
});

app.post("//create-payment-intent", async (req, res) => {
  // Validar parámetros requeridos
  const required = ["amount", "currency", "email"];
  const missing = required.filter((field) => !req.body[field]);

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Faltan campos requeridos: ${missing.join(", ")}`,
    });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
  });

  try {
    const customer = await stripe.customers.create({
      name: req.body.name || "Cliente no proporcionado",
      email: req.body.email,
    });

    const params = {
  amount: req.body.amount,
  currency: req.body.currency,
  customer: customer.id,
  payment_method_options: {
    card: {
      request_three_d_secure:
        req.body.request_three_d_secure || "automatic",
    },
  },
  payment_method_types: Array.isArray(req.body.payment_method_types) && req.body.payment_method_types.length > 0
    ? req.body.payment_method_types
    : ["card"],
};


    const paymentIntent = await stripe.paymentIntents.create(params);

    res.json({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
    });

  } catch (error) {
    console.error("Error en PaymentIntent:", error);
    res.status(500).json({
      error: error.message || "Error al crear PaymentIntent",
    });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  // Validar parámetros requeridos
  const required = ["amount", "currency", "email"];
  const missing = required.filter((field) => !req.body[field]);

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Faltan campos requeridos: ${missing.join(", ")}`,
    });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
  });

  try {
    const customer = await stripe.customers.create({
      name: req.body.name || "Cliente no proporcionado",
      email: req.body.email,
    });

    const params = {
  amount: req.body.amount,
  currency: req.body.currency,
  customer: customer.id,
  payment_method_options: {
    card: {
      request_three_d_secure:
        req.body.request_three_d_secure || "automatic",
    },
  },
  payment_method_types: Array.isArray(req.body.payment_method_types) && req.body.payment_method_types.length > 0
    ? req.body.payment_method_types
    : ["card"],
};


    const paymentIntent = await stripe.paymentIntents.create(params);

    res.json({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
    });

  } catch (error) {
    console.error("Error en PaymentIntent:", error);
    res.status(500).json({
      error: error.message || "Error al crear PaymentIntent",
    });
  }
});

// Webhook handler
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const stripe = new Stripe(stripeSecretKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
  } catch (err) {
    console.error(`⚠️  Webhook error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded":
      console.log("💰 Pago exitoso:", event.data.object.id);
      break;
    case "payment_intent.payment_failed":
      console.error(
        "❌ Pago fallido:",
        event.data.object.last_payment_error?.message
      );
      break;
    default:
      console.log(`⚠️  Evento no manejado: ${event.type}`);
  }

  res.sendStatus(200);
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("🔥 Error global:", err.stack);
  res.status(500).json({ error: "Error interno del servidor" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor funcionando en puerto ${PORT}`);
  console.log(
    `🔑 Clave Stripe: ${stripeSecretKey ? "Configurada" : "FALTANTE"}`
  );
});
