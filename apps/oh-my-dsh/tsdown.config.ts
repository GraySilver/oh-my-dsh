import { clientBundle } from '../../packages/client/tsdown.client.ts'

/** Bundle the Web-only executable plus its Host/browser connection wrapper. */
export default clientBundle(
  '@graysilver/oh-my-dsh',
  ['lib/types/bin.js', 'lib/types/index.js', 'lib/types/launch.js'],
  { hostPhase: true },
)
