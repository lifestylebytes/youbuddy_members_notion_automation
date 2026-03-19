# Notion Day Sync

Notion webhook events from the shared `4기` day-tracking data source update real `Day1 ~ Day30` checkboxes in `Team A` and `Team B`.

## What it does

1. Receives Notion webhook events at `POST /webhooks/notion`
2. Verifies the `X-Notion-Signature` using your webhook verification token
3. Checks whether the updated page belongs to the shared day-tracking data source
4. Reads the day row title like `Day 01: ...`
5. Follows the row's relation back to the connected Team A or Team B member row
6. Updates the member row's real checkbox property such as `Day1`

## Required environment

Copy `.env.example` to `.env` and fill these values:

- `NOTION_API_KEY`: internal integration token
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`: token issued when creating the webhook subscription
- `TEAM_A_DATA_SOURCE_ID`, `TEAM_B_DATA_SOURCE_ID`: the main team data sources
- `SHARED_DAY_DATA_SOURCE_ID`: the common day-tracking data source used inside member pages
- `DAY_COMPLETED_PROPERTY`: the checkbox property in the shared day data source, default `완료`

Example:

```env
PORT=3000
NOTION_API_KEY=secret_xxx
NOTION_WEBHOOK_VERIFICATION_TOKEN=verify_xxx
TEAM_A_DATA_SOURCE_ID=3281fc05de1e8056b3c7000b52e756cd
TEAM_B_DATA_SOURCE_ID=3281fc05de1e81638feb000bce950682
SHARED_DAY_DATA_SOURCE_ID=3271fc05de1e806294fa000bd4228964
DAY_COMPLETED_PROPERTY=완료
```

## Local Run

```bash
npm start
```

If the webhook server was down or some checkboxes feel delayed, run a full repair sync:

```bash
npm run resync
```

Health check:

```bash
curl http://localhost:3000/healthz
```

## Vercel Deploy

This repo is ready for Vercel deployment using the `api/` functions.

1. Import the GitHub repository into Vercel.
2. Add the same environment variables from `.env` into the Vercel project settings.
3. Deploy.
4. Use your Vercel production URL plus `/webhooks/notion` as the Notion webhook URL.

Example:

```text
https://your-project.vercel.app/webhooks/notion
```

On Vercel, `/webhooks/notion` is rewritten to the serverless function at `/api/notion-webhook`, and `/healthz` is rewritten to `/api/healthz`.

## Automatic Resync

This repo includes a GitHub Actions workflow at `.github/workflows/resync.yml` that calls the deployed resync endpoint twice a day.

- 11:00 AM Korea time
- 10:00 PM Korea time

GitHub Actions schedules run in UTC, so these are configured as:

- `0 2 * * *`
- `0 13 * * *`

Before the workflow can run, add this GitHub repository secret:

- `RESYNC_SECRET`: the same value stored in the Vercel production environment

You can also trigger the workflow manually from the GitHub Actions tab.

## Notion setup

1. Create or open your Notion integration.
2. Enable read content and update content capabilities.
3. Share `Team A`, `Team B`, and the shared `4기` day-tracking database with that integration.
4. In the integration's Webhooks tab, create a subscription that points to your public HTTPS URL plus `/webhooks/notion`.
5. Subscribe at minimum to page events such as `page.properties_updated` and `page.content_updated`.
6. Put the issued webhook verification token into `.env`.

## Important assumptions

- `Team A` and `Team B` have real checkbox properties named `Day1 ~ Day30`
- The shared day-tracking data source has a checkbox property named `완료`
- Each day row is related to the correct Team A or Team B member row
- The day row title contains the day number, for example `Day 01` or `Day 17`

## Notes

- Notion webhook delivery for aggregated page updates may take around 1 to 2 minutes.
- This service writes the visible overview checkboxes directly in Team A and Team B.
- In the current local setup, keep both `npm start` and `cloudflared tunnel --url http://localhost:3000` running for real-time updates.
- If either process was down, `npm run resync` recalculates the Team A / Team B overview from each member's original `4기`.
- On Vercel, `cloudflared` is no longer needed because the webhook URL becomes your deployed Vercel URL.
