import test from 'ava';

import { Network, Server, Transaction } from 'stellar-sdk';
import {
  AdditionalNeededSignature,
  needsAdditionalSignatures
} from './multisig';

const server = new Server('https://horizon-testnet.stellar.org');

test.before(() => {
  Network.useTestNetwork();
});

test('needsAdditionalSignatures returns one account that needs signatures', async t => {
  const xdr =
    'AAAAAP2pqbAzOfpJ6YI2AaMVaHPmtiRSjkSN2X7W5tbkZxNUAAAAZAACwhgAAAADAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAA/ampsDM5+knpgjYBoxVoc+a2JFKORI3Zftbm1uRnE1QAAAAAAAAAAACYloAAAAAAAAAAAA==';
  const transaction = new Transaction(xdr);
  const additionalSignatures = (await needsAdditionalSignatures(
    transaction,
    server
  )) as AdditionalNeededSignature[];
  t.is(additionalSignatures.length, 1);

  const { account, currentWeight, requiredWeight } = additionalSignatures[0];
  t.is(account.id, 'GD62TKNQGM47USPJQI3ADIYVNBZ6NNREKKHEJDOZP3LONVXEM4JVIEQM');
  t.is(currentWeight, 0);
  t.is(requiredWeight, 1);
});

test('needsAdditionalSignatures returns false when fully signed', async t => {
  const xdr =
    'AAAAAP2pqbAzOfpJ6YI2AaMVaHPmtiRSjkSN2X7W5tbkZxNUAAAAZAACwhgAAAADAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAA/ampsDM5+knpgjYBoxVoc+a2JFKORI3Zftbm1uRnE1QAAAAAAAAAAACYloAAAAAAAAAAAaf5AlIAAABAkoWr4hi63DDWNfM4645VZq7gWZnk5XKQjyTDu3So/vKNB/IGA3wGO1iNkDFtQ/qLF0R9l2yBy7qRgRM6i+vrBA==';
  const transaction = new Transaction(xdr);
  const additionalSignatures = await needsAdditionalSignatures(
    transaction,
    server
  );
  t.is(additionalSignatures, false);
});
