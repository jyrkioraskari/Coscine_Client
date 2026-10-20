import { DataFactory, Parser, Writer } from 'n3';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_IS_DEFINED_BY = 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy';
const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const SKOS_IN_SCHEME = 'http://www.w3.org/2004/02/skos/core#inScheme';
const DCAM_MEMBER_OF = 'http://purl.org/dc/dcam/memberOf';
const VOCABULARY_MEMBERSHIP_PREDICATES = new Set([
  RDFS_IS_DEFINED_BY,
  RDFS_SUBCLASS_OF,
  SKOS_IN_SCHEME,
  DCAM_MEMBER_OF,
]);
const externalRdfRequests = new Map();
const classInstanceRdfRequests = new Map();
const { namedNode, quad } = DataFactory;

function getMetadataRdfRequestUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const isCoscineVocabulary =
      parsedUrl.hostname === 'purl.org' &&
      /^\/coscine\/vocabular(?:y|ies)\//.test(parsedUrl.pathname);

    if (isCoscineVocabulary) {
      // Coscine vocabulary PURLs currently redirect through an archived path
      // that can return HTML or a 404. The official API provides the raw RDF
      // for both legacy `/vocabulary/` and current `/vocabularies/` URIs.
      return `/coscine-api/vocabularies/${encodeURIComponent(url)}/raw`;
    }
  } catch {
    // Let the RDF proxy produce the useful invalid-URL response below.
  }

  return `/rdf-resource?url=${encodeURIComponent(url)}`;
}

function isCoscineApplicationProfileUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'purl.org' && parsedUrl.pathname.startsWith('/coscine/ap/');
  } catch {
    return false;
  }
}

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

function rejectKnownNonRdfPayload(url, content) {
  const normalizedContent = String(content ?? '').trimStart();

  if (
    normalizedContent.startsWith('%PDF-') ||
    /^<!doctype\s+html\b/i.test(normalizedContent) ||
    /^<html\b/i.test(normalizedContent)
  ) {
    throw new Error(`Class URL did not return RDF: ${url}`);
  }
}

async function readRdfResponse(response, sourceUrl) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Unable to load metadata vocabulary (${response.status}).`);
  }

  const rdf = await response.text();
  if (!rdf.trim()) {
    throw new Error(`Metadata vocabulary returned an empty response: ${sourceUrl}`);
  }
  rejectKnownNonRdfPayload(sourceUrl, rdf);
  return rdf;
}

function fetchClassInstanceRdf(classUrl) {
  if (!classInstanceRdfRequests.has(classUrl)) {
    const request = fetch(`/coscine-api/vocabularies/${encodeURIComponent(classUrl)}/raw`, {
      headers: { Accept: 'text/turtle' },
    })
      .then((response) => readRdfResponse(response, classUrl))
      .catch(() => fetchExternalMetadataRdf(classUrl))
      .catch((error) => {
        classInstanceRdfRequests.delete(classUrl);
        throw error;
      });

    classInstanceRdfRequests.set(classUrl, request);
  }

  return classInstanceRdfRequests.get(classUrl);
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
    const request = fetch(getMetadataRdfRequestUrl(normalizedUrl), {
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
      .then((response) => readRdfResponse(response, normalizedUrl))
      .catch((error) => {
        externalRdfRequests.delete(normalizedUrl);
        throw error;
      });

    externalRdfRequests.set(normalizedUrl, request);
  }

  return externalRdfRequests.get(normalizedUrl);
}

export async function fetchExternalClassInstances(classes) {
  const classUrls = (typeof classes === 'string' ? [classes] : Array.from(classes ?? []))
    .filter((classUrl) => !isCoscineApplicationProfileUrl(classUrl));
  const results = await Promise.allSettled(
    classUrls.map(async (classUrl) => {
      const rdf = await fetchClassInstanceRdf(classUrl);
      return addCoscineVocabularyInstances(classUrl, rdf);
    }),
  );
  const loadedGraphs = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  return loadedGraphs.join('\n\n');
}
