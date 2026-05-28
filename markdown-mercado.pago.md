# MD for: https://www.mercadopago.com.br/developers/pt/docs/sdks-library/client-side/mp-js-v2.md

#  SDK JS - ES Module 

 Version 2 of the client-side SDK has functions based on Promises. In addition, it has a renewed interface for developers and handles errors more efficiently. 

![Element for view](https://www.mercadopago.com.br/sdk/mpjsv-1-rebranding.png)

 Compatible browsers 

!\[Compatible navigators\](https://www.mercadopago.com.br/sdk/mp-jsv2-browsers.png) > WARNING > > Important > > It is important to note that while \*Internet Explorer 11\* is compatible with some \[Checkout Transparente,\](https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/overview) flows, the browser is not officially supported by Mercado Pago. 

 Fraud prevention  This version has a functionality that, based on the analysis of the buyer's behavior, identifies if a transaction is fraudulent or suspicious. This analysis is intended to improve the approval of payments. If you wish, you can turn off this feature. Check our \[technical reference\](https://github.com/mercadopago/sdk-js#api). 

![](https://www.mercadopago.com.br/sdk/mpjsv2-3-rebranding.png)

 Installation 

To install the frontend SDK, include MercadoPago.js in your application's HTML or install the package on npm according to the code below. 

* [bash ](#editor%5F2)
* [html ](#editor%5F1)
html bash 

```
<body>
  <script src="https://sdk.mercadopago.com/js/v2"></script>
</body>
```

Copiar 

```
npm install @mercadopago/sdk-js
```

Copiar 

Then, add the Public key of the account being integrated so that it can be identified when connecting to Mercado Pago. Learn more about Public key in \[Credentials\](https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/additional-content/your-integrations/credentials). 

* [html ](#editor%5F3)
* [javascript ](#editor%5F4)
html javascript 

```
<script>
  const mp = new MercadoPago("YOUR_PUBLIC_KEY");
</script>
```

Copiar 

```
import { loadMercadoPago } from "@mercadopago/sdk-js";

await loadMercadoPago();
const mp = new window.MercadoPago("YOUR_PUBLIC_KEY");
```

Copiar