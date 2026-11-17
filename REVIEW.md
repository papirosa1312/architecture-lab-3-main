# Architecture review

> Заповнює студент. Не описуйте лише назву принципу: покажіть причинно-наслідковий зв'язок між кодом, ризиком і виправленням.

| Principle | Evidence (file:line) | Practical risk | Fix |
|---|---|---|---|
| Information hiding | `src/checkout/CheckoutController.ts:3`, `src/checkout/CheckoutController.ts:21-26`, `src/orders/OrderService.ts:4` | Деталі формату `StripePayload` (переведення суми в копійки `Math.round(total * 100)`, структура `metadata`) та `StripeClient` витікають у `CheckoutController` та `OrderService`. Додавання іншого платіжного провайдера або зміна версії API Stripe змусить переписувати транспортний рівень і бізнес-логіку замовлень. | Сховати `StripePayload`, `StripeResponse` і `StripeClient` всередині `src/payments/internal/`, а назовні надати нейтральний до провайдера контракт у `src/payments/PaymentService.ts`. |
| High cohesion & Design for change | `src/orders/mapPaymentStatus.ts:1-7`, `src/reports/mapPaymentStatus.ts:1-7`, `src/notifications/mapPaymentStatus.ts:1-7` | Правило перетворення сирих станів Stripe (`succeeded`, `requires_action`, `declined`) на внутрішні статуси системи продубльовано у трьох різних модулях. При додаванні нового статусу `processing` легко оновити один модуль і забути інший, що призведе до розсинхронізації між історією замовлень, звітами та сповіщеннями. | Централізувати нормалізацію статусів у єдиній функції всередині модуля `Payments`, яка перетворює сиру відповідь провайдера на стабільний доменний тип `PaymentStatus`. |
| Ownership | `src/orders/OrderService.ts:15-25`, `src/inventory/StockRepository.ts:9-11` | `OrderService` напряму читає і модифікує `database.stock` у циклі по позиціях замовлення, обходячи модуль `Inventory`. Якщо на другій позиції кошика товару не вистачить, виникне помилка, але перша позиція вже залишиться списаною у сховищі (часткове списання залишків та порушення інваріанта `available >= 0`). | Передати повний контроль над залишками модулю `Inventory` через атомарний метод `reserve(lines)`, який спочатку перевіряє всі позиції і лише потім зменшує залишки, та прибрати публічний низькорівневий метод `updateAvailable`. |
| Dependency direction & Low coupling | `src/payments/internal/StripeClient.ts:2`, `src/payments/internal/StripeClient.ts:20` | Нижньорівневий клієнт оплати `StripeClient` імпортує внутрішню функцію `markOrderPaid` із `src/orders/internal/orderMutations.ts` і напряму мутує стан замовлення в БД під час проведення платежу. Це створює циклічну залежність `Orders <-> Payments` і унеможливлює використання модуля оплати окремо від модуля замовлень. | Розірвати цикл: видалити виклик `markOrderPaid` зі `StripeClient`. Модуль `Payments` має лише повертати нормалізований результат оплати, а `OrderService` як оркестратор сам оновлюватиме стан власного замовлення. |
| Local reasoning | `src/shared/calculateTotal.ts:1`, `src/shared/calculateTotal.ts:11-23` | Функція `calculateTotal` неявно читає глобальний стан `runtimeConfig`, мутує вхідний масив `lines` (дописуючи поле `lineTotal`) і пушить запис у глобальний `auditLog`. Через приховані побічні ефекти неможливо передбачити результат функції лише за її аргументами або безпечно викликати її двічі. | Зробити `calculateTotal` чистою (pure) функцією: передавати `taxRate` та `discountPercent` явно через параметри, не змінювати вхідні об'єкти `CartLine`, а запис в `auditLog` перенести на рівень контролера/оркестрації. |
| Explicit contracts | `src/orders/OrderService.ts:13`, `src/payments/internal/StripeClient.ts:17` | Між `Checkout`, `Orders` та `Payments` відсутній явний доменний контракт на проведення оплати — замість бізнес-параметрів (сума, валюта, токен, ID замовлення) крізь шари прокидається специфічний для Stripe об'єкт `StripePayload`. | Визначити явний публічний інтерфейс `AuthorizePaymentRequest` та `AuthorizePaymentResult` на межі модуля `Payments`. |

## Change impact prediction (заповнити до реалізації change request)

**Requirement:**
Додати підтримку нового нормалізованого статусу оплати `processing`, усунути дублювання мапінгу статусів між модулями, визначити публічний провайдеро-незалежний контракт `Payments`, захистити інваріант залишків у `Inventory`, розірвати циклічну залежність `Orders <-> Payments` та зробити `calculateTotal` чистою функцією при збереженні поточної поведінки Checkout API для `paid` і `failed`.

**Expected files:**
- `src/payments/PaymentService.ts` та `src/payments/mapPaymentStatus.ts` — створення публічного контракту та єдиної точки нормалізації статусів (`paid`, `processing`, `failed`).
- `src/payments/internal/StripeClient.ts` — прибирання імпорту з `orders/internal` та підтримка стану для `processing`.
- `src/orders/OrderService.ts`, `src/orders/mapPaymentStatus.ts`, `src/orders/internal/orderMutations.ts` — перехід на публічний контракт `Payments`, делегування резервування в `Inventory` та усунення дубльованого мапінгу.
- `src/checkout/CheckoutController.ts` — відмова від формування `StripePayload`, явна передача параметрів у `calculateTotal` та запис `auditLog`.
- `src/inventory/StockRepository.ts` — заміна відкритого запису на атомарну операцію `reserve`.
- `src/shared/calculateTotal.ts` — перетворення на детерміновану чисту функцію без мутації аргументів і глобальних змінних.

**Modules that should not change:**
Після виділення єдиного мапінгу та публічного контракту `Payments` при подальших змінах логіки платіжного провайдера не повинні змінюватися модулі `Checkout`, `Orders`, `Inventory`, `Reports` та `Notifications`.

## Actual impact (заповнити після реалізації)

**Actual files changed:**

**Difference from prediction and explanation:**