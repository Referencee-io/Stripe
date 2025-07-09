const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");

// 1. Validación mejorada de variables de entorno
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

if (!stripeSecretKey.startsWith("sk_")) {
  console.error("❌ STRIPE_SECRET_KEY inválida o faltante");
  process.exit(1);
}

const app = express();

// 2. Configuración CORS mejorada
const allowedOrigins = [
  "https://refereence.io",
  "https://stripe-m1l8.onrender.com",
  "http://localhost:3000",
  "http://localhost:3001"
];

app.use(cors({
  origin: function(origin, callback) {
    // Permitir solicitudes sin 'origin' (como apps móviles)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `Origen ${origin} no permitido por CORS`;
      console.warn(msg);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Stripe-Client-Secret'] // Añadido
}));

// 3. Middleware de logs detallados
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Body:', req.body);
  next();
});

// 4. Manejo de cuerpos separado para webhooks
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  // ... (el mismo código de webhook)
});

// Manejo JSON para otras rutas
app.use(express.json());

// 5. Endpoint create-payment-intent mejorado
app.post("/create-payment-intent", async (req, res) => {
  console.log('Solicitud create-payment-intent recibida');
  
  // Validación mejorada
  if (!req.body.amount || !req.body.currency || !req.body.email) {
    console.error('Campos faltantes en solicitud:', req.body);
    return res.status(400).json({
      error: "Faltan campos requeridos: amount, currency, email"
    });
  }

  try {
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20" // Versión más reciente
    });

    // Crear cliente
    const customer = await stripe.customers.create({
      name: req.body.name || "Cliente no proporcionado",
      email: req.body.email,
      metadata: { source: "Reference App" }
    });
    console.log(`Cliente creado: ${customer.id}`);

    // Crear PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: req.body.amount,
      currency: req.body.currency,
      customer: customer.id,
      payment_method_options: {
        card: {
          request_three_d_secure: req.body.request_three_d_secure || "automatic"
        }
      },
      payment_method_types: req.body.payment_method_types || ["card"],
      description: "Pago en Reference"
    });
    console.log(`PaymentIntent creado: ${paymentIntent.id}`);

    // Respuesta explícita con headers
    res.setHeader('Stripe-Client-Secret', paymentIntent.client_secret);
    res.json({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
      status: paymentIntent.status
    });

  } catch (error) {
    console.error("Error en PaymentIntent:", error);
    res.status(500).json({
      error: error.message || "Error al crear PaymentIntent",
      code: error.code || "server_error"
    });
  }
});

// 6. Endpoint de verificación de servidor
app.get("/health", (req, res) => {
  res.json({ 
    status: "active",
    stripe: stripeSecretKey ? "configured" : "not_configured",
    timestamp: new Date().toISOString()
  });
});

// 7. Manejo de errores mejorado
app.use((err, req, res, next) => {
  console.error("🔥 Error global:", err.stack);
  res.status(500).json({ 
    error: "Error interno del servidor",
    details: process.env.NODE_ENV === "development" ? err.message : null
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor funcionando en puerto ${PORT}`);
  console.log(`🔑 Clave Stripe: ${stripeSecretKey.substring(0, 12)}...`);
  console.log(`🌍 Orígenes permitidos: ${allowedOrigins.join(", ")}`);
});
