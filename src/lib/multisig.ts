import {
  AccountResponse,
  Keypair,
  Operation,
  Server,
  StellarTomlResolver,
  Transaction,
  TransactionOperation
} from 'stellar-sdk';

import axios from 'axios';

/**
 * The threshold categories that correspond to different operation types.
 */
export enum ThresholdCategory {
  Low = 1,
  Medium = 2,
  High = 3
}

export interface NeedsSignatures {
  /**
   * The account that needs more signatures.
   */
  account: AccountResponse;

  /**
   * The required weight for this transaction.
   */
  requiredWeight: number;

  /**
   * The weight that is currently satisfied for this account in the transaction.
   */
  currentWeight: number;
}

/**
 * Checks whether an account needs more signatures to satisfy the source account weights.
 * Returns false if the transaction is fully satisfied, or an array of objects containing the account that needs more
 * signatures as well as the required weight and the current weight that is satisfied.
 *
 * @param transaction The transaction to check.
 * @param server A horizon server that is used to look up accounts.
 * @param accounts A list of accounts to use instead of looking them up with the server.
 */
export async function needsMoreSignatures(
  transaction: Transaction,
  server: Server,
  ...accounts: AccountResponse[]
): Promise<NeedsSignatures[] | false> {
  const sourceAccounts = await getSourceAccounts(transaction, server, accounts);
  const thresholdCategories = getTransactionSourceThresholdCategories(
    transaction
  );
  const requiredWeights = getRequiredWeights(
    sourceAccounts,
    thresholdCategories
  );
  const signatureWeights = getSignatureWeights(transaction, sourceAccounts);
  const additionalSignaturesNeeded = getAccountsThatNeedAdditionalSignatures(
    signatureWeights,
    requiredWeights
  );
  if (additionalSignaturesNeeded.length === 0) {
    return false;
  } else {
    return additionalSignaturesNeeded;
  }
}

type Weight = number;

function getRequiredWeights(
  sourceAccounts: AccountResponse[],
  sourceThresholdCatgories: Map<string, ThresholdCategory>
): Map<AccountResponse, Weight> {
  const weights = new Map<AccountResponse, Weight>();
  sourceAccounts.forEach(account => {
    const thresholdType = sourceThresholdCatgories.get(account.id);
    const weight = getAccountThresholdWeight(account, thresholdType);
    weights.set(account, weight);
  });

  return weights;
}

function getAccountThresholdWeight(
  account: AccountResponse,
  thresholdType: ThresholdCategory
): Weight {
  let weight = 0;
  switch (thresholdType) {
    case ThresholdCategory.Low:
      weight = account.thresholds.low_threshold;
      break;
    case ThresholdCategory.Medium:
      weight = account.thresholds.med_threshold;
      break;
    case ThresholdCategory.High:
      weight = account.thresholds.high_threshold;
      break;
  }

  return Math.max(1, weight);
}

/**
 * Gets a list of source accounts for the given transaction.
 *
 * @param transaction The transaction
 * @param server The Horizon server to use to look up account details
 * @param accounts A list of accounts to use instead of looking them up on horizon;
 */
export async function getSourceAccounts(
  transaction: Transaction,
  server: Server,
  accounts: AccountResponse[] = []
): Promise<AccountResponse[]> {
  const sources = new Set<string>([transaction.source]);
  const cachedAccounts = new Map<string, AccountResponse>();
  accounts.forEach(account => cachedAccounts.set(account.id, account));
  transaction.operations.forEach(operation => {
    if (operation.source) {
      sources.add(operation.source);
    }
  });

  return Promise.all(
    Array.from(sources).map(
      source => cachedAccounts.get(source) || server.loadAccount(source)
    )
  );
}

/**
 * Returns a list of public keys that have signed the transaction.
 *
 * @param transaction The transaction to check.
 * @param server The server to use to look up source accounts.
 * @param accounts A list of accounts to use instead of looking them up on horizon;
 */
export async function getSigners(
  transaction: Transaction,
  server: Server,
  accounts: AccountResponse[] = []
): Promise<string[]> {
  const sourceAccounts = await getSourceAccounts(transaction, server, accounts);
  const signers = sourceAccounts
    .map(account => {
      // get signers for each source account
      return account.signers
        .filter(signer =>
          hasAccountSignedTransaction(signer.public_key, transaction)
        )
        .map(signer => signer.public_key);
    })
    .reduce(
      // flatten
      (accumulator, currentValue) => accumulator.concat(currentValue),
      []
    );

  return Array.from(new Set(signers)); // remove duplicates
}

function getTransactionSourceThresholdCategories(
  transaction: Transaction
): Map<string, ThresholdCategory> {
  const sourceThresholds = new Map<string, ThresholdCategory>();
  sourceThresholds.set(transaction.source, ThresholdCategory.Medium);

  transaction.operations.forEach(operation => {
    const category = getThresholdCategory(operation);
    const source = operation.source || transaction.source;
    const previousCategory = sourceThresholds.get(source);
    if (previousCategory === undefined || category > previousCategory) {
      sourceThresholds.set(source, category);
    }
  });

  return sourceThresholds;
}

/**
 * Returns the threshold category (low, med, high) for a given operation.
 *
 * @param operation The operation for which to get the threshold category.
 */
export function getThresholdCategory(
  operation: TransactionOperation
): ThresholdCategory {
  const type = operation.type;
  if (type === 'allowTrust' || type === 'bumpSequence') {
    return ThresholdCategory.Low;
  }

  if (type === 'accountMerge') {
    return ThresholdCategory.High;
  }

  if (type === 'setOptions') {
    const op = operation as Operation.SetOptions;
    if (
      [
        op.masterWeight,
        op.lowThreshold,
        op.medThreshold,
        op.highThreshold,
        op.signer
      ].some(v => v !== undefined) // only certain things in set options require high
    ) {
      return ThresholdCategory.High;
    }
  }

  return ThresholdCategory.Medium;
}

/**
 * Contains how much weight an account currently has satisfied for the given transaction.
 */
interface AccountSignatureWeight {
  account: AccountResponse;
  currentWeight: Weight;
}

/**
 * Gets a list of accounts and current weights that have currently been signed on the transaction.
 *
 * @param transaction The transaction.
 * @param sourceAccounts An array of source accounts for this transaction.
 */
function getSignatureWeights(
  transaction: Transaction,
  sourceAccounts: AccountResponse[]
): AccountSignatureWeight[] {
  const map = new Map<AccountResponse, Weight>();
  sourceAccounts.forEach(account => {
    map.set(account, 0);
    account.signers.forEach(signer => {
      if (hasAccountSignedTransaction(signer.public_key, transaction)) {
        const previousWeight = map.get(account);
        map.set(account, previousWeight + signer.weight);
      }
    });
  });

  return Array.from(map.entries()).map(([account, currentWeight]) => ({
    account,
    currentWeight
  }));
}

/**
 * Returns true if the account has signed the given transaction. False otherwise.
 * @param account The account to check.
 * @param transaction The transaction to check.
 */
export function hasAccountSignedTransaction(
  account: string,
  transaction: Transaction
): boolean {
  const keypair = Keypair.fromPublicKey(account);
  return transaction.signatures.some(signature => {
    return (
      keypair.signatureHint().toString() === signature.hint().toString() && // compare hints because verify is much more expensive
      keypair.verify(transaction.hash(), signature.signature())
    );
  });
}

function getAccountsThatNeedAdditionalSignatures(
  accountWeights: AccountSignatureWeight[],
  requiredWeights: Map<AccountResponse, Weight>
): NeedsSignatures[] {
  return accountWeights
    .map(({ account, currentWeight }) => {
      const requiredWeight = requiredWeights.get(account);
      return { account, requiredWeight, currentWeight };
    })
    .filter(s => s.requiredWeight > s.currentWeight);
}

/**
 * Checks whether the account has a multisig server defined in its data.
 * If so, it loads the stellar.toml associated with that server and returns the MULTISIG_SERVER key.
 *
 * @param account The account to get the multisig server endpoint for.
 */
export async function getMultisigServerEndpoint(
  account: AccountResponse
): Promise<string | undefined> {
  const multisigDomain =
    account.data_attr && account.data_attr['multisig.domain'];
  if (!multisigDomain) {
    return undefined;
  }

  const url = Buffer.from(multisigDomain, 'base64').toString();
  const toml = await StellarTomlResolver.resolve(url);
  return toml.MULTISIG_SERVER;
}

/**
 * A generic response from a multisig server.
 */
export interface MultisigServerResponse {
  /**
   * An identifier for the multisig transaction generated by the server.
   */
  id: string;

  /**
   * A URL that can be used to look up the status of the multisig transaction.
   */
  statusHref: string;

  /**
   * Service specific extras.
   */
  extras?: {
    [key: string]: any;
  };
}

/**
 * A multisig transaction response from StellarGuard
 */
export interface StellarGuardResponse extends MultisigServerResponse {
  extras: {
    /**
     * This indicates that the response is from StellarGuard
     */
    isStellarGuard: true;
    /**
     * The url to authorize the StellarGuard transaction
     */
    url: string;
  };
}

/**
 * Submits a SEP-0007 style URI to a multisig server endpoint.
 *
 * @param stellarUri A SEP-0007 style "tx" URI representing the transaction to submit.
 * @param multisigServerEndpoint The multisig endpoint to submit to.
 *
 * @see https://github.com/stellarguard/stellar-uri for one way to generate the URI string.
 */
export async function submitToMultisigServer(
  stellarUri: string,
  multisigServerEndpoint: string
): Promise<MultisigServerResponse> {
  const params = {
    uri: stellarUri
  };

  const response = await axios.post<MultisigServerResponse>(
    multisigServerEndpoint,
    params
  );

  return response.data;
}
