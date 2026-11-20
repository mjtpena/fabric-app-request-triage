import type { DemoScript } from '@x10/shared/demo';

/**
 * Narrated walkthrough of Data Request Triage (demo mode, seed data). Personas: demo-admin (Jordan Lee, data team),
 * demo-priya (Priya Nair, Finance). Every locator below exists in the app (roles, labels or data-testid).
 */
const blip = (rank: number) => `[data-testid="radar-blip"][data-rank="${rank}"]`;

export const script: DemoScript = {
  title: 'Data Request Triage: the request radar',
  persona: 'demo-admin',
  scenes: [
    {
      id: 'hook',
      say: [
        'Every data team gets the same message every week: can you get me this data?',
        'This Fabric app puts every ask on one radar, ranked by a score anyone can check.',
      ],
      async run(h) {
        await h.goto('/');
        await h.pause(2500);
        await h.spotlight(h.page.getByRole('group', { name: /Radar:/ }), 3000);
      },
    },
    {
      id: 'encodings',
      say: [
        'The closer a blip sits to the centre, the higher it ranks. Its sector shows which team made the request.',
        'Size is supporters, and the trail behind it is how long it has waited.',
        'Hover a blip and the score explains itself: value, urgency and supporters, divided by effort.',
      ],
      async run(h) {
        await h.hover(h.page.locator(blip(1)));
        await h.pause(3500);
        await h.hover(h.page.locator(blip(7)));
        await h.pause(3000);
      },
    },
    {
      id: 'lenses',
      say: [
        'Lenses repaint the same radar. Age shows who has waited longest; team shows who is asking.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Age/ }));
        await h.pause(2500);
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Team/ }));
        await h.pause(2000);
      },
    },
    {
      id: 'today',
      say: [
        'Today lists what needs the data team now. The blinking blips are requests still waiting for triage.',
        'One click flies the radar to the request and switches to the lens that explains it.',
      ],
      async run(h) {
        const today = h.page.getByRole('complementary', { name: 'Today' });
        await h.spotlight(today, 2000);
        await h.click(today.getByRole('button', { name: /Training completion rates by team/ }));
        await h.pause(3500);
        await h.spotlight(h.page.getByTestId('blip-card'), 2500);
      },
    },
    {
      id: 'view-as',
      say: ['Switch the view to a requester, and Today becomes where your own requests sit in the queue.'],
      async run(h) {
        await h.goto('/', 'demo-priya');
        await h.pause(1200);
        await h.spotlight(h.page.getByRole('radiogroup', { name: 'View as' }), 1500);
        await h.spotlight(h.page.getByRole('complementary', { name: 'Today' }), 3000);
      },
    },
    {
      id: 'flight-plan',
      say: [
        'Priya needs pipeline by region, so she files a flight plan.',
        'As she types, similar open requests close in on the duplicate radar.',
        'She backs the existing request instead, and its score goes up.',
      ],
      async run(h) {
        await h.goto('/submit', 'demo-priya');
        await h.type(h.page.getByLabel('Title'), 'Pipeline by region for finance');
        await h.spotlight(h.page.getByTestId('duplicate-panel'), 3500);
        await h.click(
          h.page
            .getByTestId('duplicate-suggestion')
            .filter({ hasText: 'Sales pipeline by region with weekly snapshots' })
            .getByRole('button', { name: 'Back this instead' }),
        );
        await h.pause(1200);
        await h.spotlight(h.page.getByTestId('supporters'), 2500);
      },
    },
    {
      id: 'board',
      say: [
        'Back on the data team, the flight board shows every request by status.',
        'Move only offers what the rules allow, and triage asks for an effort size.',
      ],
      async run(h) {
        await h.goto('/board', 'demo-admin');
        await h.spotlight(h.page.getByTestId('column-new'), 2000);
        await h.click(h.page.getByRole('button', { name: 'Move “Returns rate by product category” to…' }));
        await h.pause(1200);
        await h.click(h.page.getByRole('menuitem', { name: 'Triaged' }));
        await h.select(h.page.getByRole('dialog').getByLabel('Effort size'), 'S (days)');
        await h.click(h.page.getByRole('dialog').getByRole('button', { name: 'Move to Triaged' }));
        await h.pause(1500);
        await h.spotlight(h.page.getByTestId('column-triaged'), 2000);
      },
    },
    {
      id: 'black-box',
      say: [
        'Every request keeps a black box: how long it held each status, and an append-only log of who moved it.',
      ],
      async run(h) {
        await h.goto('/?view=list');
        await h.select(h.page.getByLabel('Status'), 'All statuses');
        await h.click(h.page.getByTestId('queue-list').getByRole('link', { name: 'Website conversion funnel by device' }));
        await h.pause(800);
        await h.scrollTo(h.page.getByRole('heading', { name: 'Black box' }));
        await h.spotlight(h.page.getByTestId('timeline'), 3500);
      },
    },
    {
      id: 'takeaway',
      say: ['Requests, reasons and progress in one place, running on Fabric Apps with a Fabric SQL database.'],
      async run(h) {
        await h.goto('/');
        await h.pause(4000);
      },
    },
  ],
};
