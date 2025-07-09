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

// Configuración de CORS mejorada
app.use(
  cors({
    origin: [
      "https://refereence.io",
      "https://stripe-m1l8.onrender.com",
      "https://iodized-delicate-jupiter.glitch.me",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173", // Vite
      "http://127.0.0.1:5500", // Live Server
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middleware para logging de solicitudes (ANTES del webhook)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.url !== '/webhook') {
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
  }
  next();
});

// Manejo diferenciado de bodies (CORREGIDO)
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Endpoints
app.get("/", (req, res) => {
  res.json({ 
    message: "Servidor Stripe funcionando",
    timestamp: new Date().toISOString(),
    endpoints: ['/stripe-key', '/create-payment-intent', '/webhook']
  });
});

app.get("/stripe-key", (req, res) => {
  try {
    if (!stripePublishableKey) {
      console.error("❌ Stripe publishable key no configurada");
      return res.status(500).json({ error: "Stripe key no configurada" });
    }
    
    console.log("✅ Enviando Stripe key");
    res.json({ publishableKey: stripePublishableKey });
  } catch (error) {
    console.error("Error en /stripe-key:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  console.log("🔄 Iniciando creación de PaymentIntent");
  console.log("Datos recibidos:", req.body);

  try {
    // Validar parámetros requeridos
    const required = ["amount", "currency", "email"];
    const missing = required.filter((field) => !req.body[field]);

    if (missing.length > 0) {
      console.error("❌ Campos faltantes:", missing);
      return res.status(400).json({
        error: `Faltan campos requeridos: ${missing.join(", ")}`,
        received: Object.keys(req.body)
      });
    }

    // Validar amount
    const amount = parseInt(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      console.error("❌ Amount inválido:", req.body.amount);
      return res.status(400).json({
        error: "El amount debe ser un número positivo"
      });
    }

    // Validar currency
    const validCurrencies = ['usd', 'eur', 'gbp', 'mxn'];
    if (!validCurrencies.includes(req.body.currency.toLowerCase())) {
      console.error("❌ Currency inválida:", req.body.currency);
      return res.status(400).json({
        error: `Currency debe ser una de: ${validCurrencies.join(', ')}`
      });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email)) {
      console.error("❌ Email inválido:", req.body.email);
      return res.status(400).json({
        error: "Email inválido"
      });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    console.log("🔄 Creando customer...");
    const customer = await stripe.customers.create({
      name: req.body.name || "Cliente no proporcionado",
      email: req.body.email,
    });
    console.log("✅ Customer creado:", customer.id);

    console.log("🔄 Creando PaymentIntent...");
    const params = {
      amount: amount,
      currency: req.body.currency.toLowerCase(),
      customer: customer.id,
      payment_method_options: {
        card: {
          request_three_d_secure: req.body.request_three_d_secure || "automatic",
        },
      },
      payment_method_types: req.body.payment_method_types || ["card"],
      metadata: {
        customer_email: req.body.email,
        customer_name: req.body.name || "No proporcionado"
      }
    };

    const paymentIntent = await stripe.paymentIntents.create(params);
    console.log("✅ PaymentIntent creado:", paymentIntent.id);

    const response = {
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status
    };

    console.log("✅ Enviando respuesta:", response);
    res.json(response);

  } catch (error) {
    console.error("❌ Error en PaymentIntent:", error);
    
    // Manejo específico de errores de Stripe
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        error: "Error de tarjeta",
        message: error.message,
        code: error.code
      });
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: "Petición inválida a Stripe",
        message: error.message
      });
    }
    
    if (error.type === 'StripeAPIError') {
      return res.status(500).json({
        error: "Error de API de Stripe",
        message: "Problema temporal con Stripe"
      });
    }
    
    if (error.type === 'StripeConnectionError') {
      return res.status(500).json({
        error: "Error de conexión con Stripe",
        message: "No se pudo conectar con Stripe"
      });
    }
    
    if (error.type === 'StripeAuthenticationError') {
      return res.status(500).json({
        error: "Error de autenticación con Stripe",
        message: "Credenciales de Stripe inválidas"
      });
    }

    // Error genérico
    res.status(500).json({
      error: "Error interno del servidor",
      message: error.message || "Error desconocido",
      timestamp: new Date().toISOString()
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
    console.log("✅ Webhook verificado:", event.type);
  } catch (err) {
    console.error(`⚠️  Webhook error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded":
      console.log("💰 Pago exitoso:", event.data.object.id);
      console.log("💰 Amount:", event.data.object.amount);
      console.log("💰 Currency:", event.data.object.currency);
      break;
    case "payment_intent.payment_failed":
      console.error(
        "❌ Pago fallido:",
        event.data.object.last_payment_error?.message
      );
      break;
    case "payment_intent.created":
      console.log("🔄 PaymentIntent creado:", event.data.object.id);
      break;
    default:
      console.log(`⚠️  Evento no manejado: ${event.type}`);
  }

  res.sendStatus(200);
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("🔥 Error global:", err.stack);
  res.status(500).json({ 
    error: "Error interno del servidor",
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  console.log(`❌ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor funcionando en puerto ${PORT}`);
  console.log(`🔑 Clave Stripe: ${stripeSecretKey ? "Configurada" : "FALTANTE"}`);
  console.log(`🔑 Publishable Key: ${stripePublishableKey ? "Configurada" : "FALTANTE"}`);
  console.log(`🔑 Webhook Secret: ${stripeWebhookSecret ? "Configurada" : "FALTANTE"}`);
});
