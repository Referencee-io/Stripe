const handlePayment = async () => {
  setLoading(true);
  
  try {
    // 1. Crear PaymentIntent
    const response = await fetch(`${API_URL}/create-payment-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken}` // Si usas autenticación
      },
      body: JSON.stringify({
        email: user.email,
        amount: montoTotal * 100,
        currency: "mxn",
        name: `${nombre} ${primerApellido} ${segundoApellido}`,
        request_three_d_secure: "automatic"
      })
    });

    // 2. Verificar respuesta HTTP
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Error ${response.status}`);
    }

    // 3. Obtener datos de la respuesta
    const data = await response.json();
    console.log("Datos del servidor:", data);

    if (!data.clientSecret) {
      throw new Error("No se recibió clientSecret del servidor");
    }

    // 4. Inicializar Payment Sheet
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: data.clientSecret,
      merchantDisplayName: "Reference",
      allowsDelayedPaymentMethods: true,
      billingDetailsCollectionConfiguration: {
        email: "never", // Ya tenemos el email
        name: "never",  // Ya tenemos el nombre
      },
      style: "alwaysDark",
      appearance: {
        colors: {
          primary: "#3498db",
          background: "#2c3e50",
          componentBackground: "#34495e",
          componentText: "#ecf0f1"
        }
      }
    });

    if (initError) {
      throw new Error(initError.message);
    }

    // 5. Presentar Payment Sheet
    const { error: paymentError } = await presentPaymentSheet();
    
    if (paymentError) {
      throw new Error(paymentError.message);
    }

    // 6. Procesar pago exitoso
    await processSuccessfullPayment(data.id);
    setMessageSuccess(true);

  } catch (error) {
    console.error("Error en el proceso de pago:", error);
    Alert.alert("Error", error.message);
  } finally {
    setLoading(false);
  }
};
