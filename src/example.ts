import { TransactionStellarUri } from '@stellarguard/stellar-uri';
import { Network, Server, Transaction } from 'stellar-sdk';
import {
  getMultisigServerEndpoint,
  needsMoreSignatures,
  submitToMultisigServer
} from './lib/multisig';

async function example(): Promise<any> {
  const xdr =
    'AAAAAJGPH15xlQ7jI0OCRbJtbQIXCzGEksFaWkFIj+u/wB09AAAAZAADBg0AAAACAAAAAAAAAAAAAAABAAAAAAAAAAoAAAAPbXVsdGlzaWdfc2VydmVyAAAAAAEAAAAUdGVzdC5zdGVsbGFyZ3VhcmQubWUAAAAAAAAAAb/AHT0AAABA7m74KsutOpKcSx8b8/LdIB+OeWklIveKGQ1B5EjNCyfAy+/tYML3YYoRi5ju7pw5HalLlG4Mh32jqqyZe0QVAQ==';
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
    const stellarUri = TransactionStellarUri.forTransaction(transaction);
    if (multisigServerEndpoint) {
      console.log(`Submitting to multisig server: ${multisigServerEndpoint}`);
      return submitToMultisigServer(
        stellarUri.toString(),
        multisigServerEndpoint
      );
    } else {
      console.log(
        'Requires more signature, but no multisig endpoint defined for ' +
          account.id
      );
      // no multisig endpoint defined, do whatever you want with it:
      // - show SEP-007 url or QR code?
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
