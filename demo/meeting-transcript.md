# Google Doc — meeting transcript (demo prop)

Paste this into a Google Doc to show as the "Meet transcript" source during the
recording. Uses the same people as the live Slack demo (erica, Angelo). No live
Google Meet/Drive integration — fixtures only.

---

**Sprint Planning — Week 11**
March 14, 2024 · 9:00–9:15 AM
Attendees: erica, Angelo

— Transcript —

**00:31  erica:** Alright, let's run through it. First — the auth service refactor. That PR's still not merged and it's been sitting for two weeks. What's blocking it?

**00:47  Angelo:** That's on me. The code's done, I just still need to add integration tests before it can go in. I'll get to it by end of week.

**01:10  erica:** Okay, let's make sure it lands this sprint. Next — the API rate limiting we talked about last sprint still isn't implemented. It's honestly a security risk at this point, anyone can hammer the endpoints.

**01:28  Angelo:** Yeah, we should close that out. Can you take it?

**01:33  erica:** I'll pick it up, and I'll document the limits in the API docs too so it's not just tribal knowledge.

**01:46  Angelo:** One more thing before we wrap — the error monitoring dashboard hasn't been updated since we switched to the new logger. It's showing wrong data, so people are starting to ignore it.

**02:04  erica:** Can you fix that one?

**02:07  Angelo:** Yeah, I'll fix the dashboard config this sprint and repoint it at the new logger.

**02:18  erica:** Great. So — auth PR merged with tests on you, rate limiting plus docs on me, dashboard fix on you. Thanks.

— End of transcript —
