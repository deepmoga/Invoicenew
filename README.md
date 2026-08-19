# Invoice CRM

Dependency-free Node.js 22 CRM for companies, customers, items and GST invoices.

## Run

```powershell
node server.js
```

Open `http://localhost:3000`. On first launch, create the administrator account.

Data is stored in `data/crm.sqlite`. Company logos are stored in `uploads/`.

## WhatsApp

Add the Meta Graph API access token and phone-number ID under Settings. The customer must have a phone number in international format. The current integration sends a text summary and invoice link; production internet hosting is needed for a customer-accessible link.
