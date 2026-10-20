import { DataFactory, Parser, Writer } from 'n3';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_IS_DEFINED_BY = 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy';
const SKOS_IN_SCHEME = 'http://www.w3.org/2004/02/skos/core#inScheme';
const DCAM_MEMBER_OF = 'http://purl.org/dc/dcam/memberOf';
const VOCABULARY_MEMBERSHIP_PREDICATES = new Set([
  RDFS_IS_DEFINED_BY,
  SKOS_IN_SCHEME,
  DCAM_MEMBER_OF,
]);
const externalRdfRequests = new Map();
const { namedNode, quad } = DataFactory;

function serializeTurtle(quads) {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'text/turtle' });
    writer.addQuads(quads);
    writer.end((error, output) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(output);
    });
  });
}

async function addCoscineVocabularyInstances(classUrl, rdf) {
  let quads;

  try {
    quads = new Parser().parse(rdf);
  } catch {
    return rdf;
  }

  if (quads.some((item) => item.predicate.value === RDF_TYPE && item.object.value === classUrl)) {
    return rdf;
  }

  const subjects = new Map();
  for (const item of quads) {
    if (
      item.subject.termType === 'NamedNode' &&
      VOCABULARY_MEMBERSHIP_PREDICATES.has(item.predicate.value) &&
      item.object.value === classUrl
    ) {
      subjects.set(item.subject.value, item.subject);
    }
  }

  if (!subjects.size) {
    return rdf;
  }

  const instanceQuads = Array.from(subjects.values(), (subject) =>
    quad(subject, namedNode(RDF_TYPE), namedNode(classUrl)),
  );
  return `${rdf.trim()}\n\n${await serializeTurtle(instanceQuads)}`;
}

export function fetchExternalMetadataRdf(url) {
  const normalizedUrl = String(url ?? '').trim();
  if (!normalizedUrl) {
    return Promise.reject(new Error('Cannot load an empty RDF resource URL.'));
  }

  if (!externalRdfRequests.has(normalizedUrl)) {
    const request = fetch(`/rdf-resource?url=${encodeURIComponent(normalizedUrl)}`, {
      headers: {
        Accept: [
          'text/turtle',
          'application/trig',
          'application/n-triples',
          'application/n-quads',
          'text/n3',
          'application/ld+json',
          'application/rdf+xml',
        ].join(', '),
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || `Unable to load metadata vocabulary (${response.status}).`);
        }

        const rdf = await response.text();
        if (!rdf.trim()) {
          throw new Error(`Metadata vocabulary returned an empty response: ${normalizedUrl}`);
        }
        return rdf;
      })
      .catch((error) => {
        externalRdfRequests.delete(normalizedUrl);
        throw error;
      });

    externalRdfRequests.set(normalizedUrl, request);
  }

  return externalRdfRequests.get(normalizedUrl);
}

export async function fetchExternalClassInstances(classes) {
  const classUrls = typeof classes === 'string' ? [classes] : Array.from(classes ?? []);
  const results = await Promise.allSettled(
    classUrls.map(async (classUrl) => {
      const rdf = await fetchExternalMetadataRdf(classUrl);
      return addCoscineVocabularyInstances(classUrl, rdf);
    }),
  );
  const loadedGraphs = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (!loadedGraphs.length && results.length) {
    throw results.find((result) => result.status === 'rejected').reason;
  }

  return loadedGraphs.join('\n\n');
}
