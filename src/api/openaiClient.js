const getEnv = (key) => (typeof window !== 'undefined' && window.__ENV__?.[key]) || import.meta.env[key] || '';
const OPENAI_API_KEY = getEnv('VITE_OPENAI_API_KEY');
const OPENAI_BASE = 'https://api.openai.com/v1';

// ─── WHISPER: Audio → Transcription ─────────────────────────────────────────
export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'es');

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.text;
}

// ─── GPT-4o-mini: Transcription → PO Structure ──────────────────────────────
export async function extractPOFromTranscription(transcription, suppliers, products) {
  const supplierList = suppliers
    .map(s => `ID:${s.id} NOMBRE:"${s.name}"`)
    .join('\n');
  const productList = products
    .map(p => `ID:${p.id} NOMBRE:"${p.product_name}" SKU:${p.sku} UNIDAD:${p.purchase_unit_code || p.base_unit_code || 'ud'} PRECIO_MEDIO:${p.avg_price || 0}`)
    .join('\n');

  const systemPrompt = `Eres un asistente para un restaurante español.
Extrae el pedido de la transcripción de voz y devuelve ÚNICAMENTE JSON válido, sin markdown ni explicaciones.
Esquema exacto:
{
  "supplier_id": "string o null si no identificas al proveedor",
  "supplier_name": "nombre tal como se mencionó",
  "notes": "notas adicionales mencionadas",
  "lines": [
    {
      "product_id": "string o null si no identificas el producto",
      "product_name": "nombre tal como se mencionó",
      "quantity": número,
      "unit": "unidad (kg, l, caja, ud, etc.)",
      "unit_price": número (0 si no se menciona)
    }
  ]
}
Intenta identificar el proveedor y productos de las listas. Si no los encuentras exactamente, usa null para el ID.`;

  const userPrompt = `PROVEEDORES DISPONIBLES:\n${supplierList}\n\nPRODUCTOS DISPONIBLES:\n${productList}\n\nTRANSCRIPCIÓN:\n"${transcription}"`;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ─── GPT-4o-mini Vision: Image → GRN Structure ──────────────────────────────
export async function extractGRNFromImage(base64Image, mimeType = 'image/jpeg') {
  const systemPrompt = `Eres un sistema OCR especializado en albaranes de entrega de restaurantes españoles.
Extrae los datos del albarán y devuelve ÚNICAMENTE JSON válido, sin markdown ni explicaciones.
Esquema exacto:
{
  "supplier_name": "nombre del proveedor",
  "delivery_date": "YYYY-MM-DD o null",
  "albaran_number": "número de albarán o null",
  "lines": [
    {
      "product_name": "nombre del producto",
      "quantity": número,
      "unit": "unidad (kg, l, caja, ud, etc.)",
      "unit_price": número,
      "total": número
    }
  ],
  "total_amount": número,
  "confidence": número entre 0 y 1
}
Normaliza las fechas a YYYY-MM-DD. Si no encuentras un campo usa null.`;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extrae todos los datos de este albarán.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ─── GPT-4o-mini: Metrics → AI Recommendations ──────────────────────────────
export async function generateAIRecommendations(metricsContext) {
  const systemPrompt = `Eres un consultor experto en food cost para restaurantes españoles.
Analiza las métricas y genera entre 3 y 5 recomendaciones accionables y específicas.
Devuelve ÚNICAMENTE JSON válido con este esquema:
{
  "recommendations": [
    {
      "title": "string (máx 60 caracteres)",
      "text": "string (2-3 frases concretas y accionables)",
      "priority": "High o Medium o Low",
      "estimated_impact_eur": número,
      "related_driver": "driver_1 o driver_2 o driver_3 o driver_4",
      "action_type": "review_prices o check_reception o review_waste o check_recipes o stock_control o supplier_negotiation o training o other"
    }
  ]
}
driver_1=precios compra, driver_2=incidencias recepción, driver_3=mermas producción, driver_4=waste servicio.
Sé específico: menciona porcentajes y productos concretos cuando se proporcionen.`;

  const lines = [
    `MÉTRICAS DEL DÍA ${metricsContext.date}:`,
    `- Ventas totales: ${metricsContext.salesEur?.toFixed(2)}€`,
    `- Food cost teórico: ${((metricsContext.theoreticalFcPct || 0) * 100).toFixed(1)}% (${metricsContext.theoreticalCogsEur?.toFixed(2)}€)`,
    `- Food cost real: ${((metricsContext.actualFcPct || 0) * 100).toFixed(1)}% (${metricsContext.actualCogsEur?.toFixed(2)}€)`,
    `- Gap: ${((metricsContext.gapPct || 0) * 100).toFixed(1)}% (${metricsContext.gapEur?.toFixed(2)}€)`,
    `- Driver 1 (Precios compra): ${(metricsContext.driver1Pct || 0).toFixed(0)}% del gap → ${(metricsContext.driver1Eur || 0).toFixed(2)}€`,
    `- Driver 2 (Incidencias recepción): ${(metricsContext.driver2Pct || 0).toFixed(0)}% del gap → ${(metricsContext.driver2Eur || 0).toFixed(2)}€`,
    `- Driver 3 (Mermas producción): ${(metricsContext.driver3Pct || 0).toFixed(0)}% del gap → ${(metricsContext.driver3Eur || 0).toFixed(2)}€`,
    `- Driver 4 (Waste servicio): ${(metricsContext.driver4Pct || 0).toFixed(0)}% del gap → ${(metricsContext.driver4Eur || 0).toFixed(2)}€`,
  ];

  if (metricsContext.incidents?.length) {
    lines.push(`- Incidencias abiertas (${metricsContext.incidents.length}): ${metricsContext.incidents.slice(0, 3).map(i => i.description).join('; ')}`);
  }
  if (metricsContext.topWasteProducts?.length) {
    lines.push(`- Productos con más merma: ${metricsContext.topWasteProducts.slice(0, 3).map(p => `${p.product_name}: ${(p.wasteValue || 0).toFixed(0)}€`).join(', ')}`);
  }
  lines.push('\nPrioriza los drivers con mayor impacto económico.');

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: lines.join('\n') },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content).recommendations || [];
}

// ─── GPT-4o-mini: Stock + Consumption → Smart Order Quantities ───────────────
export async function calculateSmartOrderQty(itemsToOrder, targetDays = 7) {
  const systemPrompt = `Eres un sistema de gestión de compras para restaurantes.
Calcula las cantidades óptimas de pedido para cubrir exactamente ${targetDays} días de stock.
Devuelve ÚNICAMENTE JSON válido:
{
  "items": [
    {
      "product_id": "string",
      "suggested_qty": número (entero, mínimo 1),
      "suggestion_reason": "string (máx 80 caracteres)"
    }
  ]
}
Fórmula: suggested_qty = MAX(1, ceil((avg_daily_consumption * target_days) - current_stock))
Redondea hacia arriba al entero más cercano.`;

  const userPrompt = `OBJETIVO: Cubrir ${targetDays} días de stock.\nPRODUCTOS A PEDIR:\n${
    itemsToOrder.map(i =>
      `- ID:${i.product_id} NOMBRE:"${i.product_name}" STOCK_ACTUAL:${i.currentStock} ${i.unit} CONSUMO_DIARIO_MEDIO:${i.avgDailyConsumption} ${i.unit} PRECIO:${i.avgPrice}€`
    ).join('\n')
  }`;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content).items || [];
}
