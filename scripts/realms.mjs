/**
 * Lists the Realms the configured Microsoft account can join.
 *
 *   npm run realms
 *
 * Use the printed id as MC_REALM_ID in .env. The account must own the Realm or
 * have accepted an invite to it.
 */
import { Authflow } from 'prismarine-auth'
import { RealmAPI } from 'prismarine-realms'
import { config } from '../src/config.js'

if (config.auth !== 'microsoft') {
  console.error('Set MC_AUTH=microsoft in .env first -- Realms cannot be joined in offline mode.')
  process.exit(1)
}

const flow = new Authflow(config.username, config.profilesFolder, { flow: 'live' }, (data) => {
  console.log(`\nSign in at ${data.verification_uri} and enter code: ${data.user_code}\n`)
})

const api = RealmAPI.from(flow, 'java')
const realms = await api.getRealms()

if (!realms?.length) {
  console.log('No Realms found for this account.')
  console.log('Make sure the bot account owns a Realm, or has accepted an invite to one.')
  process.exit(0)
}

console.log(`\nRealms available to ${config.username}:\n`)
for (const realm of realms) {
  console.log(`  id: ${realm.id}`)
  console.log(`  name: ${realm.name}`)
  if (realm.motd) console.log(`  motd: ${realm.motd}`)
  console.log(`  owner: ${realm.owner ?? 'unknown'}`)
  console.log(`  state: ${realm.state ?? 'unknown'}`)
  console.log('')
}
console.log('Put one of these ids in .env as MC_REALM_ID, then run: npm start')
