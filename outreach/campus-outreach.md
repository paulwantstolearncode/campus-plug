# Campus Plug — Campus Outreach Kit

Built from the production snapshot (2026-09-25): **10 live listings, 7 of 14 categories empty, board mostly active since August.** That's not a weakness to hide — for sellers it's the single strongest recruiting pitch available: *early movers own the board.* Use Part 1 for students (supply), Part 2 for businesses (visibility) once Part 1 moves the numbers.

---

## Part 1 — Seller Recruitment (do this first)

**Where**: print via `/admin/posters` → **Seller Recruitment** template (A4 for noticeboards at Balme Library / Night Market / Pentagon gate; Mobile Story for WhatsApp Status). Copy-paste the message below into hall WhatsApp groups and your status.

**WhatsApp blast (copy/paste):**

> 🔌 **Sell on Campus Plug — Legon's own marketplace**
>
> Looking to make money this semester? Hair, nails, tutoring, tech repairs, food, thrift — students are already searching for it.
>
> Why now:
> ✅ First movers get seen — most categories are still wide open
> ✅ Your buyers message you directly on WhatsApp (no middleman, no commission)
> ✅ Free to post. Verified sellers get a shop page + reviews.
>
> Post yours in 2 minutes → https://campuspluggh.com/become-seller

**Category-specific openers** (send the one matching the group you're in):

| Group | Line |
|---|---|
| Hair/beauty halls | "Right now there are only 3 hair & beauty vendors on the board — and every fresher is looking for braids in January." |
| Course/hall groups | "Tutoring has 0 listings. If you got an A in ECON/STAT/DCIT, that's money on the table." |
| Tech lads | "One laptop-repair vendor on the whole platform. Break season is coming." |
| Foodie groups | "Meal preps & small chops: 1 listing. Freshers don't cook — be there when they arrive." |

**Poster strategy**: 20 A4s (Balme ×5, Night Market ×5, Pentagon ×3, Evandy/TF ×4, common rooms ×3) + set the mobile story as your WhatsApp Status on Sunday evening (peak planning time).

**Follow-up ritual**: reply to every new seller within 24h, help them price their first listing, then ask them to tell one friend. Supply compounds through sellers, not ads.

---

## Part 2 — Founding-Partner Banner Pitch (after supply moves)

**Where**: WhatsApp or email to 3–5 businesses near campus (print shops, phone-accessory stalls, hostels-with-availability, food joints).

**The pitch (copy/paste):**

> Hi [Name] 👋
>
> I run **Campus Plug** — campuspluggh.com — a student marketplace for UG Legon where students buy and book directly over WhatsApp. It's student-run and growing week by week.
>
> Right now every visit is **100% buyer-intent** — students come specifically to find services and products around campus, and the feed has zero ad noise. Your banner would be one of at most 2–3 on the homepage, seen by exactly the audience you want (UG students, phone-first).
>
> **Founding partner offer** — for the first 3 businesses:
> 📌 Homepage banner slot, 30 days — **GH₵100** (rate locks for life at renewal)
> 📌 Your logo in our WhatsApp Status promos (1,000+ student views/post)
> 📌 A tracked link so you see exactly how many clicks you got
>
> Worst case, you're the only non-student brand a few hundred UG students see this month. Best case, you own the audience before your competitors know the platform exists.
>
> Can I send a mock-up of your banner on the homepage?

**Numbers you can quote honestly today** (update monthly from `/dashboard` + admin analytics):

- Live student listings: **10** (and climbing)
- Categories live: **7 of 14** (hair/beauty, fashion, tech, snacks, beauty products, gifts)
- Every listing visit = a student actively looking to buy/book on campus
- Views→WhatsApp-click CVR: pull from `/dashboard` seller analytics before sending; even early single-digit CVR on WhatsApp-first platforms is a strong story

**Objection handling:**
- *"10 listings is small"* — "Exactly why you're getting founding pricing. You're buying the position, not the traffic. By January's fresher wave the board doubles and your rate never changes."
- *"Do students trust it?"* — "Sellers are verified by us, every listing is reviewed, and transactions happen on WhatsApp the same way students already buy from each other."
- *"Why not Instagram ads?"* — "You'd pay more per impression and reach mostly non-buyers. This is the only campus platform where 100% of visitors are students looking to transact."

**Close**: 7-day trial banner at 50% if they hesitate. One yes beats five maybes — take it, screenshot the result, and use it to sell the next one.

---

## Measurement (so the next pitch is stronger)

1. Before any send: add `?utm_source=` tags if links are shared in posts (`?utm_source=poster`, `?utm_source=whatsapp_group`, `?utm_source=status`) — analytics_events already captures sources.
2. Weekly: run queries 1, 3, 7 from `supabase/funnel_metrics_queries.sql` in the SQL editor (views→clicks→outcomes, outcome mix, recorded sales).
3. After posters go up: watch listing_view source mix for a poster/QR spike, and count new seller signups per location.
