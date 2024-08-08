const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3001;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const currencyMap = {
  uk: "UAH",
  en: "USD",
};

const formatPrice = (price, locale) => {
  const currency = currencyMap[locale];

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(price);
};

app.use(bodyParser.json());

app.post("/place_order", (req, res) => {
  const {
    first_name,
    last_name,
    telephone,
    country,
    state,
    city,
    address,
    locale,
    total,
    cart,
    additional,
  } = req.body;

  const cartMessage = cart
    .map(
      (product) =>
        `🏷️ *Title:* ${product.title}\n🔢 *Quantity:* ${product.quantity}\n🔗 *Product URL:* ${product.productUrl}`
    )
    .join("\n\n");

  const message = `👤 *First Name:* ${first_name}\n🧔 *Last Name:* ${last_name}\n📞 *Telephone:* ${telephone}\n🌍 *Country:* ${country}\n🌍 *State:* ${state}\n🌍 *City:* ${city}\n🏠 *Address:* ${address}\n💲 *Total:* ${formatPrice(
    total,
    locale
  )}\n📄 *Additional Information:* ${additional}\n\n🛒 *Products:*\n\n ${cartMessage}`;

  axios
    .post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    })
    .then(() => {
      res.status(200).send({ status: "success" });
    })
    .catch((error) => {
      res.status(500).send({ status: "error", message: error.message });
    });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
