// Loaded only by an isolated headless invocation, never into the desktop profile.
export const name = 'latex-selection-boundary';
export const inject = ['tools', 'llm', 'agentDefaultModel', 'appExit'];

export function apply(ctx, config) {
  ctx.tools.guard(() => 'This selection assistant cannot execute tools.');
  ctx.on('agent/created', ({agent}) => agent.ctx.tools.restrict({allow: []}));
  if (!config.catalog) return;
  setImmediate(async () => {
    try {
      await ctx.get('loader')?.await();
      const models = [];
      const selected = ctx.agentDefaultModel.currentSelection();
      // Account login and API-key login remain distinct, advertised routes.
      for (const provider of ['deepseek-account', 'deepseek-official']) {
        for (const model of await ctx.llm.listModels(provider)) {
          const info = await ctx.llm.resolveModelInfo(provider, model.id);
          const reasoning = info.reasoning;
          models.push({id: `${provider}/${model.id}`,
            name: `${model.name} (${provider === 'deepseek-account' ? 'Harness' : 'API'})`,
            efforts: reasoning?.efforts?.map(effort => typeof effort === 'string' ? effort : effort.id) || [],
            default_effort: reasoning?.defaultEffort || '',
            default: selected.provider === provider && selected.model === model.id});
        }
      }
      process.stdout.write(JSON.stringify({models}) + '\n');
      ctx.appExit(0);
    } catch {
      ctx.appExit(1);
    }
  });
}
