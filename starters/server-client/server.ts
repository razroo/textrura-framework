import { box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

await createServer(
  () =>
    box({ padding: 16, gap: 8, flexDirection: 'column' }, [
      text({ text: 'Server starter', font: 'bold 18px Inter', lineHeight: 24, color: '#fff' }),
      text({ text: 'Open client.ts in browser environment', font: '14px Inter', lineHeight: 20, color: '#cbd5e1' }),
    ]),
  {
    port: 8080,
    width: 700,
    height: 400,
  },
)
