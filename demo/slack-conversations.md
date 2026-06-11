# Demo Slack conversations (copy-paste)

Paste these into your Slack workspace to recreate the threads the pipeline
ingests. They mirror `fixtures/slack-threads.json` and `fixtures/meet-transcript.json`,
so what people see in Slack matches the tasks the pipeline extracts.

> Tip: post each line as a separate message. To show threads, post the first
> line in the channel, then reply in-thread for the rest. If you're posting
> solo, just prefix each line with the speaker name as shown.

---

## #dev — login timeout bug

```
alice: The login timeout bug is still happening on mobile safari. Users are getting logged out after 5 mins.
bob: Yeah I saw that too. We need to increase the session TTL and add a keep-alive ping.
alice: Bob can you take that? It's blocking the demo next week.
bob: On it.
```

**Pipeline should extract:** Fix session TTL + keep-alive ping (assignee: bob, high)

---

## #infra — staging DB disk

```
carol: Staging DB is running out of disk, we're at 87% capacity.
dave: We should probably clean up the old migration snapshots and set up an alert at 80%.
carol: Agreed. And probably worth bumping the volume too before the next release.
```

**Pipeline should extract:** Clean up snapshots + 80% alert (dave), bump volume (carol)

---

## #product — onboarding v2

```
eve: We decided in the meeting to go with the new onboarding flow for v2.
frank: Great. Someone needs to update the Figma specs and brief the frontend team.
eve: I can do the Figma update, can you brief frontend Frank?
frank: Sure.
```

**Pipeline should extract:** Update Figma specs (eve), brief frontend team (frank)

---

## Sprint Planning — Week 11 (meeting transcript)

Post this in a `#meetings` channel or read it aloud as the "Meet transcript" source.

```
alice: Let's talk about the auth service refactor. We haven't merged that PR yet and it's been sitting for two weeks.
bob: I know, I still need to add integration tests before it can go in. I'll get to it by end of week.
carol: Also the API rate limiting we discussed last sprint — that's still not implemented. It's a security risk.
dave: I can pick that up. Should probably document the limits in the API docs too once it's done.
alice: One more thing — the error monitoring dashboard hasn't been updated since we switched to the new logger. It's showing wrong data.
bob: That's on me, I'll fix the dashboard config this sprint.
```

**Pipeline should extract:** Merge auth PR (bob), implement rate limiting (dave), fix dashboard config (bob)

---

### Note

The pipeline reads from `fixtures/`, **not** live Slack — these messages are for
the on-screen story during the recording. To ingest *real* live Slack instead of
fixtures, that's a separate integration (not part of the current demo).
