# Search, inventory and demo data

Mileway stores its searchable inventory in MongoDB. A bus describes the layout of a vehicle. A route identifies an operator, a direction and its stops. Each trip snapshots the bus, route, departure, arrival, seat fares and cancellation terms for one service date. A booking retains the information the customer accepted at checkout.

## Searching for departures

Send a GET request to `/api/v1/search` with the city names returned by `/api/v1/cities?q=Ben` and a date in `YYYY-MM-DD` format. Searches use the departure date in India. The response contains a `data` array and a `pagination` object with the current page, page size, total records and number of pages. Bookable departures have a future departure time and a scheduled or delayed status.

| Parameter | Values |
| --- | --- |
| `from`, `to` | Required city names, matched without case sensitivity |
| `date` | Required calendar date in Asia/Kolkata |
| `minPrice`, `maxPrice` | Inclusive minimum advertised seat fares in whole INR |
| `ac` | `true` or `false` |
| `kind` | `seater` or `sleeper` |
| `departure`, `arrival` | Local period of the departure or arrival, including an overnight arrival |
| `operator` | Operator name |
| `amenities` | Comma-separated names. A matching bus offers every requested amenity |
| `minRating` | Minimum operator score, from 0 to 5 |
| `sort` | `price`, `duration`, `departure` ascending, or `rating` descending |
| `page`, `limit` | First page is 1. Default page size is 20, with a maximum of 100 |

Morning runs from 06:00 to 12:00 IST, afternoon to 17:00 and evening to 21:00. Night runs from 21:00 to 06:00. Each period includes its start time.

Each search result includes the base fare, computed duration, stops, cancellation notice in hours, refund percentage and current seat count. Search deducts booked seats and holds whose expiration is still in the future. Availability can change between search and checkout. The seat-hold endpoint arbitrates conflicting requests.

`GET /api/v1/trips/{id}/seats` returns a trip's seat states and prices. Row and column coordinates start at zero. A sleeper has lower and upper decks. Each seat number is unique within one departure.

## Home and reviews

`GET /api/v1/routes/popular` groups upcoming trips by direction and returns the lowest scheduled fare, the shortest scheduled duration and distance. Four featured corridors take precedence when they have upcoming services. Subsequent entries are ordered by frequency.

The coupon endpoint lists active offers with a future expiry. Checkout validates the coupon and its minimum spend again and applies the discount cap to the seat subtotal.

Seeded reviews are fictional examples marked with `isSeeded: true`. For a customer review, the server checks that the caller owns a confirmed booking whose scheduled arrival has passed. A unique booking index allows one review per journey. The public response includes the author's display name and excludes their account, booking and contact details. Visible reviews determine the operator's score, rounded to one decimal.

## Renewing demo inventory

From the repository root, configure `MONGODB_URI` and a private `DEMO_SEED_PASSWORD`, then run `npm run seed`. The target database must support transactions for the booking flow. A local single-node replica set and Atlas both support this.

The seed covers today and the next 14 Indian calendar dates. It creates 24 cities, 48 station records, 10 fictional operators, 30 buses, 60 operator-route records across 40 distinct directions, up to 900 dated trips (60 per complete date), three coupons and 100 marked example reviews. On each complete date, Bengaluru to Chennai has six departures with different vehicle classes and prices.

Stable fixture IDs and insert-only upserts preserve existing fixture edits, accounts and seat bookings. Re-run the command periodically to extend the calendar. The seeder skips elapsed departures. Each new departure uses its current bus layout, stops and base fare. Scheduling checks run under the same bus lock used by the operator dashboard and preserve any overlapping operator service, including one spanning midnight. Historical and cancelled fixture IDs remain reserved. A unique email collision with an unrelated account stops the seed. Check the target database and resolve the conflicting data before retrying. The seed never grants privileges to an existing account by matching its email. Existing demo passwords are preserved on reseed and can be changed through the normal account flow.

The default demo account addresses are `customer@mileway.test`, `operator1@mileway.test` through `operator10@mileway.test`, and `admin@mileway.test`. All use the initial seed passphrase. To choose a different domain for a fresh database, set `DEMO_SEED_EMAIL_DOMAIN` before first seeding and retain it for later runs.

The rolling seed extends fictional timetables from the bundled fixtures. Operators can schedule additional services with their management account. Historical bookings remain queryable as their travel dates pass.
