# Decision log

## Decision 1: Централізація нормалізації статусів оплати в модулі Payments

**Problem:** Логіка перетворення сирих станів провайдера Stripe (`succeeded`, `requires_action`, `declined`) на внутрішні статуси системи була тричі продубльована в модулях `Orders`, `Reports` та `Notifications`.

**Evidence:** `src/orders/mapPaymentStatus.ts:1-7`, `src/reports/mapPaymentStatus.ts:1-7`, `src/notifications/mapPaymentStatus.ts:1-7`.

**Decision:** Створити єдину функцію нормалізації `mapPaymentStatus` у `src/payments/mapPaymentStatus.ts`, яка повертає канонічний тип `PaymentStatus` (`"paid" | "processing" | "failed"`), а в інших модулях залишити лише делегування до неї.

**Why:** Це забезпечує High Cohesion та Information Hiding: лише модуль `Payments` знає семантику кодів відповіді платіжного шлюзу, тому додавання статусу `processing` виконується в одній точці без ризику розсинхронізації звітів чи сповіщень.

**Alternative:** Оновити умову `if (response.state === "requires_action") return "processing"` окремо в кожному з трьох файлів `mapPaymentStatus.ts`.

**Why rejected:** Порушує принцип Design for Change і зберігає прихований coupling між трьома модулями та внутрішнім форматом `StripeResponse`.

**Trade-off:** Модулі `Orders`, `Reports` і `Notifications` тепер залежать від спільного типу статусу, визначеного в публічному контракті `Payments`.

**Verification:** Усі стартові функціональні тести та новий unit-тест `mapPaymentStatus normalizes paid, processing, failed and unknown provider statuses` успішно проходять (`npm test`).

## Decision 2: Fail-safe обробка невідомих статусів платіжного провайдера як failed

**Problem:** Зовнішній платіжний провайдер може повернути новий або недокументований код стану транзакції, який ще не описаний у мапінгу системи.

**Evidence:** `src/payments/mapPaymentStatus.ts:5-12` (обробка значень поза переліком `succeeded` та `requires_action`).

**Decision:** Будь-який невідомий або неочікуваний статус провайдера за замовчуванням нормалізується у безпечний стан `"failed"`, що переводить замовлення у статус `"payment_pending"`.

**Why:** За принципом Explicit Contracts та фінансової безпеки непідтверджена або невідома відповідь шлюзу ніколи не повинна трактуватися як успішна оплата (`paid`), щоб уникнути безкоштовного відвантаження товару клієнту.

**Alternative:** Кидати необроблений виняток (`throw new Error("Unknown status")`) або переводити невідомий статус у стан `"processing"`.

**Why rejected:** Виняток зламає публічний контракт Checkout API (замість контрольованої відповіді повернеться HTTP 500), а статус `"processing"` введе користувача в оману щодо активної обробки невалідного платежу.

**Trade-off:** Якщо провайдер введе новий проміжний статус успіху без оновлення нашого адаптера, транзакція тимчасово вважатиметься неуспішною до виправлення мапінгу.

**Verification:** Перевірено unit-тестом передачі об'єкта `{ state: "unexpected_gateway_code" }` у `mapPaymentStatus`, який детерміновано повертає `"failed"`.