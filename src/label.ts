import { AppBskyActorDefs, ComAtprotoLabelDefs } from '@atproto/api';
import { DID, PORT, TEAMS, SIGNING_KEY, DELETE } from './constants.js';
import type { Category } from './types.js';
import { LabelerServer } from '@skyware/labeler';

const server = new LabelerServer({ did: DID, signingKey: SIGNING_KEY });

server.start(PORT, (error, address) => {
  if (error) {
    console.error('Error starting server:', error);
  } else {
    console.log(`Labeler server listening on ${address}`);
  }
});

export const label = async (subject: string | AppBskyActorDefs.ProfileView, rkey: string) => {
  const did = AppBskyActorDefs.isProfileView(subject) ? subject.did : subject;
  console.group(`Labeling ${did}`);
  console.log(`Received rkey: ${rkey}`);

  try {
    const labelCategories = fetchCurrentLabels(did);

    if (rkey.includes(DELETE)) {
      console.group('Deleting all labels...');
      await deleteAllLabels(did, labelCategories);
      console.groupEnd();
    } else {
      console.group('Adding/updating label...');
      await addOrUpdateLabel(did, rkey, labelCategories);
      console.groupEnd();
    }
  } catch (error) {
    console.error('Error in `label` function:', error);
  }
  console.groupEnd();
};

function fetchCurrentLabels(did: string) {
  console.group('Fetching current labels');
  console.log('DID:', did);
  const categories = ['nfl'];
  const labelCategories: Record<string, Set<string>> = {};

  for (const category of categories) {
    console.group(`Category: ${category}`);
    const query = server.db
      .prepare<
        unknown[],
        ComAtprotoLabelDefs.Label
      >(`SELECT * FROM labels WHERE uri = ? AND val LIKE '${category}-%' ORDER BY cts DESC`)
      .all(did);

    const labels = query.reduce((set, label) => {
      if (!label.neg) set.add(label.val);
      else set.delete(label.val);
      return set;
    }, new Set<string>());

    labelCategories[category] = labels;
    console.log(`Labels:`, Array.from(labels));
    console.groupEnd();
  }

  console.groupEnd();
  return labelCategories;
}

async function deleteAllLabels(did: string, labelCategories: Record<string, Set<string>>) {
  console.group('Deleting all labels');
  console.log('DID:', did);
  const labelsToDelete = Object.values(labelCategories).flatMap((set) => Array.from(set));

  if (labelsToDelete.length === 0) {
    console.log('No labels to delete');
  } else {
    console.log('Labels to delete:', labelsToDelete);
    try {
      await server.createLabels({ uri: did }, { negate: labelsToDelete });
      console.log('Successfully deleted all labels');
    } catch (error) {
      console.error('Error during mass deletion:', error);
    }
  }
  console.groupEnd();
}

async function addOrUpdateLabel(did: string, rkey: string, labelCategories: Record<string, Set<string>>) {
  console.group('Adding or updating label');
  console.log('DID:', did, 'rkey:', rkey);
  const newLabel = findLabelByPost(rkey);
  if (!newLabel) {
    console.log('No matching label found for rkey');
    console.groupEnd();
    return;
  }

  const category = getCategoryFromLabel(newLabel.label);
  const existingLabels = labelCategories[category];

  console.log('Category:', category);
  console.log('Existing labels:', existingLabels);
  console.log('New label:', newLabel.label);

  if (existingLabels.size > 0) {
    console.group('Negating existing labels');
    try {
      await server.createLabels({ uri: did }, { negate: Array.from(existingLabels) });
      console.log('Successfully negated existing labels');
    } catch (error) {
      console.error('Error negating existing labels:', error);
    }
    console.groupEnd();
  }

  console.group('Adding new label');
  try {
    await server.createLabel({ uri: did, val: newLabel.label });
    console.log('Successfully labeled');
    labelCategories[category] = new Set([newLabel.label]);
  } catch (error) {
    console.error('Error adding new label:', error);
  }
  console.groupEnd();

  console.groupEnd();
}

function findLabelByPost(rkey: string) {
  console.group('Finding label...');
  console.log('rkey:', rkey);
  for (const category of ['nfl'] as const) {
    const found = TEAMS[category].find((team) => team.post === rkey);
    if (found) {
      console.log('Found label:', found);
      console.groupEnd();
      return found;
    }
  }
  console.log('No label found');
  console.groupEnd();
  return null;
}

function getCategoryFromLabel(label: string): Category {
  const category = 'nfl';
  if (label.startsWith(`${category}-`)) {
    return category as Category;
  }
  throw new Error(`Invalid label: ${label}`);
}
