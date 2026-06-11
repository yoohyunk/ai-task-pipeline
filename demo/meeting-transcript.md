# Google Doc — meeting transcript (demo prop)

Paste this into a Google Doc to show as the "Meet transcript" source during the
recording. Mirrors `fixtures/meet-transcript.json` (used only in the fixtures
demo, `INGEST_SOURCE=fixtures`). No live Google Meet/Drive integration.

---

**Sprint Planning — Week 11**
March 14, 2024 · 9:00–9:20 AM
Attendees: Alice, Bob, Carol, Dave

— Transcript —

**00:32  Alice:** Okay, let's get into it. First thing — the auth service refactor. We still haven't merged that PR and it's been sitting for two weeks now. What's blocking it?

**00:48  Bob:** Yeah, that's on me. The code's done, but I still need to add integration tests before it can go in. I'll get to it by end of week.

**01:15  Alice:** Sounds good, let's make sure it lands this sprint. Carol, anything from your side?

**01:22  Carol:** Yeah — the API rate limiting we talked about last sprint still isn't implemented. It's honestly a bit of a security risk at this point; anyone can hammer the endpoints.

**01:40  Dave:** I can pick that up. While I'm in there I'll document the limits in the API docs too, so it's not just tribal knowledge.

**01:55  Carol:** Perfect, thank you.

**02:10  Alice:** One more thing before we wrap. The error monitoring dashboard hasn't been updated since we switched to the new logger — it's showing wrong data, so people are starting to ignore it.

**02:28  Bob:** Ah, that's mine too. I'll fix the dashboard config this sprint and repoint it at the new logger.

**02:39  Alice:** Great. So: auth PR merged with tests, rate limiting plus docs, and the dashboard fix. Thanks everyone.

— End of transcript —
