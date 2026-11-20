# Demo tickets and verification

A confirmed traveller can open the ticket from booking history, download the PDF, or print the browser view. The PDF includes boarding and dropping points, local journey times in India, seat assignments, passenger names and ages, fare, discount, and payment method. A cancellation makes the verification link invalid immediately and closes the download endpoint.

The QR opens the verification page at the configured public origin. Its random token resolves to the current status, booking reference, route, operator, journey date and seat count. Passenger names, ages, phone numbers and email addresses stay in the protected booking.

## PDF fonts

Mileway embeds Noto Sans subsets when a name, stop, operator or route contains Bengali, Devanagari, Gujarati, Gurmukhi, Kannada, Malayalam, Odia, Tamil or Telugu script. Latin text uses the standard Helvetica PDF fonts. The bundled Indic fonts occupy approximately 1.3 MiB on the server. Only glyphs used on a ticket are embedded in the PDF. Additional scripts, including Arabic and CJK, require additional font coverage for reliable PDF rendering.

The unmodified Noto fonts are distributed with their [SIL Open Font License](../apps/api/assets/fonts/OFL.txt).
