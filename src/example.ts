import { Network, Server, Transaction } from 'stellar-sdk';
import {
  getMultisigServerEndpoint,
  needsMoreSignatures,
  submitToMultisigServer
} from './lib/multisig';

async function example(): Promise<any> {
  const xdr =
    'AAAAAIgonWxCIJ+iujMoFWN/rjZ+oqeAJhLW7yjoLVU5hZyHAAAAyAACwa0AAAABAAAAAAAAAAAAAAACAAAAAQAAAAD9qamwMzn6SemCNgGjFWhz5rYkUo5Ejdl+1ubW5GcTVAAAAAEAAAAA/ampsDM5+knpgjYBoxVoc+a2JFKORI3Zftbm1uRnE1QAAAAAAAAAAACYloAAAAABAAAAAJTCEBkjP2vZOWO/MzaJLFlx+RRkTRJFdgsXCnkreyrIAAAAAQAAAACUwhAZIz9r2TljvzM2iSxZcfkUZE0SRXYLFwp5K3sqyAAAAAAAAAAAAJiWgAAAAAAAAAAEOYWchwAAAEC8Bjg8ateKZ1ojAS9+jKiLcb/MAIdbxC1rmM27MmEO/1WyacRhmtXIppR4Zvi8ZVKyt/jMO7pzg3Mz5T4UTTAF5GcTVAAAAEBKg6ltCMfLBgOuzoCxgJxMtuI9Z5GRMFur6iy7hF7c23Zh+BnUsJRooHshAvCBNl5U9wuJgU+3uIlci/SUqAULK3sqyAAAAEBKT9sWI3fBC0loLpuhdY1qLXzUfHCMpkYgH6/EZ18Sf8OQFhZNdZ6k7qtliF/US3ZdCQg9Ov9TdTNJUsgiiR0Gp/kCUgAAAEC9w9vhg106ctP81c47ukVW3a/QGyP4bKZfH1BzmOfLoArkyk8EN1P4J2j4L7gMpdtV+Xh7jTthDY8+Fc2G7D8H';
  const transaction = new Transaction(xdr);
  Network.useTestNetwork();
  const server = new Server('https://horizon-testnet.stellar.org');

  const requiresSignatures = await needsMoreSignatures(transaction, server);

  if (requiresSignatures) {
    console.log(
      `Requires more signatures for: ${requiresSignatures.map(
        s => s.account.id
      )}`
    );
    const account = requiresSignatures[0].account; // how do we decide who we send this to? should we loop looking for a multisig endpoint?
    const multisigServerEndpoint = await getMultisigServerEndpoint(account);
    if (multisigServerEndpoint) {
      return submitToMultisigServer(transaction, multisigServerEndpoint);
    } else {
      console.log(
        'Requires more signature, but no multisig endpoint defined for ' +
          account.id
      );
      // no multisig endpoint defined, do whatever you want with it:
      // - show SEP-007 url?
      // - submit to generic multisig server?
    }
  } else {
    console.log('No more signatures required, submitting to horizon.');
    return server.submitTransaction(transaction);
  }
}

example()
  .then(c => console.log(c))
  .catch(c => console.log(c.response.data || c.response));
