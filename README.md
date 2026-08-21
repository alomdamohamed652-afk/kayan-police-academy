# Kayan Police Academy

البوابة الإلكترونية الرسمية لأكاديمية شرطة كيان لسيرفر FiveM/Discord.

## التقنية

- React + Vite للواجهة.
- Express API في `server/index-v2.mjs`.
- Discord OAuth2 لتسجيل الدخول.
- Google Sheets كمصدر بيانات أفراد الشرطة.
- Google Sheets / ملف JSON محلي لتخزين بيانات الأكاديمية حسب إعدادات البيئة.

## التشغيل المحلي

```bash
npm install
npm run dev
```

الواجهة تعمل عبر Vite والـ API يعمل عبر Express.

## إعداد البيئة

انسخ `.env.example` إلى `.env` واضبط:

- Discord OAuth2: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`.
- Google Sheets: `GOOGLE_SHEET_ID` و `GOOGLE_SHEET_RANGE`، أو استخدم `GOOGLE_SERVICE_ACCOUNT_JSON` للتخزين المستمر.
- الإدارة: `ACADEMY_ADMIN_IDS`.
- الجلسات: `SESSION_SECRET` عشوائي وطويل؛ في الإنتاج يجب ألا يكون قيمة افتراضية.

**مهم:** لا تضع Client Secret أو Service Account JSON الحقيقي داخل GitHub.

## المكونات الأساسية

- تسجيل الدخول عبر Discord.
- التقديمات والدفعات.
- الاختبارات والتصحيح التلقائي.
- هيكل الأكاديمية.
- سجل أفراد الشرطة من Google Sheets.
- مركز إدارة بصلاحيات متعددة وسجل Audit.

## ملاحظات الإنتاج

قبل النشر النهائي راجع متغيرات البيئة، خصوصًا `SESSION_SECRET` وDiscord OAuth Redirect URI وصلاحيات Google Sheets. كما يُفضّل تشغيل المشروع خلف HTTPS.
