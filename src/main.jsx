import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataFactory, Parser, Writer } from 'n3';
import '@ulb-darmstadt/shacl-form';
import coscineLogo from './assets/coscine_rgb.svg';
import { createCoscineService } from './coscineApi';
import { fetchExternalClassInstances, fetchExternalMetadataRdf } from './externalRdf';
import {
  cacheFilePreview,
  createFileListPreview,
  createTypeThumbnail,
  filePreviewCacheKey,
  filePreviewFingerprint,
  readCachedFilePreviews,
} from './filePreviewCache';
import './styles.css';

const FORM_MEMORY_STORAGE_KEY = 'coscine-upload:form-memory:v1';
const API_TOKEN_STORAGE_KEY = 'coscine-upload:api-token:v1';
const SELECTED_RESOURCE_STORAGE_KEY = 'coscine-upload:selected-resource:v1';
const EMPTY_SEARCH_FILES = Object.freeze([]);
const MAX_SEARCH_SELECT_VALUES = 10;
const MAX_TEXT_PREVIEW_BYTES = 100_000;
const TABULAR_PREVIEW_PAGE_ROWS = 100;
const FILE_LIST_PAGE_SIZE = 4;
const MAX_TABULAR_PREVIEW_BYTES = 50_000_000;
const DCTERMS_CONFORMS_TO = 'http://purl.org/dc/terms/conformsTo';
const DCTERMS_DESCRIPTION = 'http://purl.org/dc/terms/description';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SH_NODE_SHAPE = 'http://www.w3.org/ns/shacl#NodeShape';
const SH_CLASS = 'http://www.w3.org/ns/shacl#class';
const SH_DATATYPE = 'http://www.w3.org/ns/shacl#datatype';
const SH_IN = 'http://www.w3.org/ns/shacl#in';
const SH_PATH = 'http://www.w3.org/ns/shacl#path';
const SH_PROPERTY = 'http://www.w3.org/ns/shacl#property';
const SH_NAME = 'http://www.w3.org/ns/shacl#name';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const SH_DESCRIPTION = 'http://www.w3.org/ns/shacl#description';
const SH_QUALIFIED_VALUE_SHAPE = 'http://www.w3.org/ns/shacl#qualifiedValueShape';
const SH_TARGET_CLASS = 'http://www.w3.org/ns/shacl#targetClass';
const SH_MIN_COUNT = 'http://www.w3.org/ns/shacl#minCount';
const SH_MIN_LENGTH = 'http://www.w3.org/ns/shacl#minLength';
const SH_DEFAULT_VALUE = 'http://www.w3.org/ns/shacl#defaultValue';
const SH_MIN_LENGTH_CONSTRAINT = 'http://www.w3.org/ns/shacl#MinLengthConstraintComponent';
const SH_MIN_COUNT_CONSTRAINT = 'http://www.w3.org/ns/shacl#MinCountConstraintComponent';
const SH_QUALIFIED_MIN_COUNT_CONSTRAINT = 'http://www.w3.org/ns/shacl#QualifiedMinCountConstraintComponent';
const OWL_IMPORTS = 'http://www.w3.org/2002/07/owl#imports';
const { literal, namedNode, quad } = DataFactory;
const GLOBAL_LANGUAGE_OPTIONS = [
  {
    value: 'en',
    label: 'English',
    iconSrc: 'https://unpkg.com/language-icons/icons/en.svg',
  },
  {
    value: 'de',
    label: 'Deutsch',
    iconSrc: 'https://unpkg.com/language-icons/icons/de.svg',
  },
];
const APP_TEXT = {
  en: {
    aims: 'AIMS',
    apiTokenPlaceholder: 'Coscine API token',
    browserMemory: 'Browser memory',
    coscinePath: 'Coscine path',
    loadResources: 'Login with API Token',
    loading: 'Loading...',
    loadingShaclForm: 'Loading SHACL form...',
    logOut: 'Log out',
    mainViews: 'Main views',
    noFilesYet: 'No files yet.',
    ready: 'Ready',
    rememberLogin: 'Keep me logged in on this device',
    delete: 'Delete',
    download: 'Download',
    files: 'Files',
    loadingFiles: 'Loading files...',
    loadingPreview: 'Loading preview...',
    loadResourcesBeforeSearch: 'Load production resources before searching.',
    noFilterFields: 'No metadata fields match this search.',
    noMatchingFiles: 'No files match the current metadata filters.',
    noReadableMetadata: 'No readable Coscine metadata is available for this file.',
    pending: 'Pending',
    refresh: 'Refresh',
    requiredMetadata: 'Required metadata',
    resourceName: 'Resource name',
    search: 'Search',
    searchProfiles: 'Search profiles',
    showReadonlyFields: 'Show all fields',
    selectResource: 'Select a resource',
    resizeFormAndFiles: 'Resize form and files',
    searching: 'Searching...',
    selectedFile: 'Selected file',
    selectFilePrompt: 'Select a file to inspect its preview and metadata.',
    selectResourcePrompt: 'Select a resource to load its files and metadata filters.',
    preview: 'Preview',
    metadata: 'Metadata',
    shaclFormFile: 'SHACL form file',
    tabSearch: 'Search',
    tabUpload: 'Upload',
    uploadFile: 'Upload files to Coscine',
    uploading: 'Uploading...',
    useMemoryCheckbox: 'Remember all metadata values in this browser for the next upload.',
  },
  de: {
    aims: 'AIMS',
    apiTokenPlaceholder: 'Coscine-API-Token',
    browserMemory: 'Browser-Speicher',
    coscinePath: 'Coscine-Pfad',
    loadResources: 'Mit API-Token anmelden',
    loading: 'Wird geladen...',
    loadingShaclForm: 'SHACL-Formular wird geladen...',
    logOut: 'Abmelden',
    mainViews: 'Hauptansichten',
    noFilesYet: 'Noch keine Dateien.',
    ready: 'Bereit',
    rememberLogin: 'Auf diesem Geraet angemeldet bleiben',
    delete: 'Loeschen',
    download: 'Herunterladen',
    files: 'Dateien',
    loadingFiles: 'Dateien werden geladen...',
    loadingPreview: 'Vorschau wird geladen...',
    loadResourcesBeforeSearch: 'Produktionsressourcen laden, um sie zu durchsuchen.',
    noFilterFields: 'Keine Metadatenfelder entsprechen dieser Suche.',
    noMatchingFiles: 'Keine Dateien entsprechen den aktuellen Metadatenfiltern.',
    noReadableMetadata: 'Fuer diese Datei sind keine lesbaren Coscine-Metadaten verfuegbar.',
    pending: 'Ausstehend',
    refresh: 'Aktualisieren',
    requiredMetadata: 'Erforderliche Metadaten',
    resourceName: 'Ressourcenname',
    search: 'Suchen',
    searchProfiles: 'Profile suchen',
    showReadonlyFields: 'Alle Felder anzeigen',
    selectResource: 'Ressource waehlen',
    resizeFormAndFiles: 'Formular und Dateien skalieren',
    searching: 'Suche...',
    selectedFile: 'Ausgewaehlte Datei',
    selectFilePrompt: 'Datei auswaehlen, um Vorschau und Metadaten anzuzeigen.',
    selectResourcePrompt: 'Ressource auswaehlen, um Dateien und Metadatenfilter zu laden.',
    preview: 'Vorschau',
    metadata: 'Metadaten',
    shaclFormFile: 'SHACL-Formulardatei',
    tabSearch: 'Suche',
    tabUpload: 'Hochladen',
    uploadFile: 'Dateien nach Coscine hochladen',
    uploading: 'Wird hochgeladen...',
    useMemoryCheckbox: 'Alle Metadatenwerte in diesem Browser fuer den naechsten Upload speichern.',
  },
};
const AppTextContext = createContext(APP_TEXT.en);

function useAppText() {
  return useContext(AppTextContext);
}

function readSavedApiToken() {
  try {
    return localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function readSavedResourceKey() {
  try {
    return localStorage.getItem(SELECTED_RESOURCE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeSavedResourceKey(resourceKeyValue) {
  try {
    if (resourceKeyValue) {
      localStorage.setItem(SELECTED_RESOURCE_STORAGE_KEY, resourceKeyValue);
    }
  } catch {
    // Resource selection remains usable when browser storage is unavailable.
  }
}

function App() {
  const [apiToken, setApiToken] = useState(() => readSavedApiToken());
  const [rememberLogin, setRememberLogin] = useState(() => Boolean(readSavedApiToken()));
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [activeTab, setActiveTab] = useState('upload');
  const [searchProfile, setSearchProfile] = useState(null);
  const [searchResourceDetails, setSearchResourceDetails] = useState(null);
  const [, setSearchFilterRdf] = useState('');
  const [searchRangeFilters, setSearchRangeFilters] = useState({});
  const [isLoadingSearchSelection, setIsLoadingSearchSelection] = useState(false);
  const [projectsCount, setProjectsCount] = useState(0);
  const [resources, setResources] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [profile, setProfile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [targetPath, setTargetPath] = useState('');
  const [metadataContent, setMetadataContent] = useState('');
  const [metadataValid, setMetadataValid] = useState(false);
  const [metadataValidationSummary, setMetadataValidationSummary] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formMemoryFields, setFormMemoryFields] = useState([]);
  const [rememberedFieldPaths, setRememberedFieldPaths] = useState([]);
  const metadataFormRef = useRef(null);
  const shouldRestoreLogin = useRef(Boolean(readSavedApiToken()));
  const coscineService = useMemo(() => createCoscineService(), []);
  const text = APP_TEXT[selectedLanguage] ?? APP_TEXT.en;
  const canLoadResources = !isLoadingResources && (!coscineService.tokenRequired || Boolean(apiToken.trim()));

  useEffect(() => {
    document.documentElement.lang = selectedLanguage;
  }, [selectedLanguage]);

  useEffect(() => {
    try {
      if (rememberLogin && apiToken.trim()) {
        localStorage.setItem(API_TOKEN_STORAGE_KEY, apiToken);
      } else {
        localStorage.removeItem(API_TOKEN_STORAGE_KEY);
      }
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }, [apiToken, rememberLogin]);

  const selectedResource = useMemo(
    () => resources.find((resource) => resourceKey(resource) === selectedKey) ?? null,
    [resources, selectedKey],
  );
  function selectResource(resourceKeyValue) {
    setSelectedKey(resourceKeyValue);
    writeSavedResourceKey(resourceKeyValue);
  }

  useEffect(() => {
    setProjectsCount(0);
    setResources([]);
    setSelectedKey('');
    setSearchProfile(null);
    setSearchResourceDetails(null);
    setSearchFilterRdf('');
    setSearchRangeFilters({});
    setProfile(null);
    setSelectedFiles([]);
    setTargetPath('');
    setMetadataContent('');
    setMetadataValid(false);
    setMetadataValidationSummary('');
    setError('');
    setStatus('');
  }, [coscineService]);

  async function loadResources(event) {
    event?.preventDefault();
    setError('');
    setStatus(`Loading ${coscineService.label} resources...`);
    setProjectsCount(0);
    setResources([]);
    setSelectedKey('');
    setSearchProfile(null);
    setSearchResourceDetails(null);
    setSearchFilterRdf('');
    setSearchRangeFilters({});
    setProfile(null);
    setMetadataContent('');
    setMetadataValid(false);
    setMetadataValidationSummary('');
    setIsLoadingResources(true);

    try {
      const payload = await coscineService.fetchResourceOptions(apiToken);
      const savedResourceKey = readSavedResourceKey();
      const restoredResourceKey = payload.resources.some(
        (resource) => resourceKey(resource) === savedResourceKey,
      )
        ? savedResourceKey
        : payload.resources[0]
          ? resourceKey(payload.resources[0])
          : '';
      setProjectsCount(payload.projects);
      setResources(payload.resources);
      setSelectedKey(restoredResourceKey);
      writeSavedResourceKey(restoredResourceKey);
      setIsLoggedIn(true);
      setStatus(payload.resources.length ? '' : 'No resources returned for this API token.');
    } catch (loadError) {
      setIsLoggedIn(false);
      setError(loadError.message || 'Could not load Coscine resources.');
      setStatus('');
    } finally {
      setIsLoadingResources(false);
    }
  }

  function logOut() {
    setApiToken('');
    setRememberLogin(false);
    setIsLoggedIn(false);
    setProjectsCount(0);
    setResources([]);
    setSelectedKey('');
    setSearchProfile(null);
    setSearchResourceDetails(null);
    setProfile(null);
    setSelectedFiles([]);
    setTargetPath('');
    setMetadataContent('');
    setMetadataValid(false);
    setMetadataValidationSummary('');
    setError('');
    setStatus('Logged out.');
  }

  useEffect(() => {
    if (!shouldRestoreLogin.current) {
      return;
    }

    shouldRestoreLogin.current = false;
    loadResources();
  }, []);

  useEffect(() => {
    if ((!apiToken.trim() && coscineService.tokenRequired) || !selectedResource) {
      return undefined;
    }

    let isActive = true;
    setError('');
    setProfile(null);
    setMetadataContent('');
    setMetadataValid(false);
    setMetadataValidationSummary('');
    setIsLoadingProfile(true);
    setStatus('Loading application profile...');

    coscineService.fetchApplicationProfileDefinition(apiToken, selectedResource.applicationProfileUri)
      .then((loadedProfile) => {
        if (!isActive) {
          return;
        }

        setProfile(loadedProfile);
        setStatus('');
      })
      .catch((profileError) => {
        if (!isActive) {
          return;
        }

        setError(profileError.message || 'Could not load the selected resource form.');
        setStatus('');
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [apiToken, coscineService, selectedResource]);

  useEffect(() => {
    if (
      activeTab !== 'search' ||
      !apiToken.trim() ||
      !selectedResource ||
      typeof coscineService.fetchResourceDetails !== 'function'
    ) {
      return undefined;
    }

    let isActive = true;
    setError('');
    setStatus('Loading selected resource files...');
    setSearchResourceDetails(null);
    setSearchProfile(null);
    setSearchFilterRdf('');
    setSearchRangeFilters({});
    setIsLoadingSearchSelection(true);

    const detailsRequest = coscineService.fetchResourceDetails(apiToken, {
      projectId: selectedResource.projectId,
      resourceId: selectedResource.resourceId,
    });
    const profileRequest = selectedResource.applicationProfileUri
      ? coscineService.fetchApplicationProfileDefinition(apiToken, selectedResource.applicationProfileUri)
          .catch((profileError) => ({ profileError }))
      : Promise.resolve(null);

    Promise.all([detailsRequest, profileRequest])
      .then(([details, loadedProfile]) => {
        if (!isActive) {
          return;
        }

        setSearchResourceDetails(details);
        setSearchProfile(loadedProfile?.profileError ? null : loadedProfile);
        if (loadedProfile?.profileError) {
          console.error('[Coscine search UI] Application profile failed to load', {
            resourceId: selectedResource.resourceId,
            profileUri: selectedResource.applicationProfileUri,
            message: loadedProfile.profileError.message,
          });
          setError(loadedProfile.profileError.message || 'Could not load the selected resource form.');
        } else {
          console.info('[Coscine search UI] Application profile loaded', {
            resourceId: selectedResource.resourceId,
            profileUri: selectedResource.applicationProfileUri,
            shapeCharacters: loadedProfile?.shapes?.length ?? 0,
          });
        }
        setStatus('');
      })
      .catch((selectionError) => {
        if (!isActive) {
          return;
        }

        setError(selectionError.message || 'Could not load the selected resource.');
        setStatus('');
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingSearchSelection(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeTab, apiToken, coscineService, selectedResource]);

  async function uploadToCoscine() {
    setError('');
    setStatus('Preparing Coscine metadata...');
    setIsUploading(true);

    try {
      if (typeof metadataFormRef.current?.serialize !== 'function') {
        throw new Error('The Coscine metadata form is not ready yet.');
      }

      if (typeof metadataFormRef.current?.validate === 'function') {
        const validationReport = await metadataFormRef.current.validate(false);

        if (!validationReport?.conforms) {
          setMetadataValid(false);
          const validationSummary = formatValidationReport(metadataFormRef.current, validationReport);
          setMetadataValidationSummary(validationSummary);
          throw new Error(validationSummary || 'Complete the required Coscine metadata before uploading.');
        }
      }

      const serializedMetadata = metadataFormRef.current.serialize();

      if (!String(serializedMetadata ?? '').trim()) {
        throw new Error('Fill the required Coscine metadata before uploading.');
      }

      setMetadataContent(serializedMetadata);
      setMetadataValid(true);
      setMetadataValidationSummary('');
      saveRememberedFormFields({
        contextKey: getFormMemoryContextKey(profile, selectedResource),
        fieldPaths: rememberedFieldPaths,
        fields: formMemoryFields,
        metadataContent: serializedMetadata,
        profile,
      });
      const filesToUpload = selectedFiles;

      if (!filesToUpload.length) {
        throw new Error('Choose at least one file to upload.');
      }

      setStatus(`Uploading ${filesToUpload.length} file${filesToUpload.length === 1 ? '' : 's'} and metadata to ${coscineService.label}...`);

      for (const [index, file] of filesToUpload.entries()) {
        const fileName = getUploadTargetPath(file, targetPath, filesToUpload.length);
        setStatus(`Uploading ${index + 1} of ${filesToUpload.length}: ${fileName}...`);

        await coscineService.uploadFile({
          apiToken,
          projectId: selectedResource?.projectId,
          resourceId: selectedResource?.resourceId,
          file,
          fileName,
          metadataContent: serializedMetadata,
          profile,
        });
      }

      setStatus(`Uploaded ${filesToUpload.length} file${filesToUpload.length === 1 ? '' : 's'} to ${coscineService.label}.`);
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload to Coscine.');
      setStatus('');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <AppTextContext.Provider value={text}>
    <main className="app-shell">
      <LanguageSelector
        language={selectedLanguage}
        onLanguageChange={setSelectedLanguage}
      />

      <header className="top-bar">
        <div className="brand-block">
          <img src={coscineLogo} alt="Coscine" className="coscine-logo" />
          <div>
            <p className="eyebrow">RWTH Coscine</p>
            <h1>Client</h1>
          </div>
        </div>

        <form className="token-form" onSubmit={loadResources}>
          <input
            type="password"
            value={apiToken}
            placeholder={text.apiTokenPlaceholder}
            autoComplete="off"
            onChange={(event) => {
              setApiToken(event.target.value);
              setIsLoggedIn(false);
            }}
          />
          <label className="remember-login">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(event) => setRememberLogin(event.target.checked)}
            />
            <span>{text.rememberLogin}</span>
          </label>
          <button
            className={isLoggedIn ? 'login-button logged-in' : 'login-button'}
            type={isLoggedIn ? 'button' : 'submit'}
            disabled={!canLoadResources}
            onClick={isLoggedIn ? logOut : undefined}
          >
            {isLoadingResources ? text.loading : isLoggedIn ? text.logOut : text.loadResources}
          </button>
        </form>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {status ? <div className="status-line">{status}</div> : null}

      <section className="common-resource-bar" aria-label={text.selectResource}>
        {resources.length ? (
          <>
            <label className="field-label common-resource-picker">
              <span>{text.selectResource}</span>
              <select value={selectedKey} onChange={(event) => selectResource(event.target.value)}>
                {groupResourcesByProject(resources).map((project) => (
                  <optgroup key={project.id} label={project.name}>
                    {project.resources.map((resource) => (
                      <option key={resourceKey(resource)} value={resourceKey(resource)}>
                        {getResourceDisplayName(resource)}
                        {getResourceTypeDisplayName(resource) ? ` (${getResourceTypeDisplayName(resource)})` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {selectedResource ? (
              <div className="common-resource-context">
                <span>{getProjectDisplayName(selectedResource)}</span>
                {getResourceTypeDisplayName(selectedResource) ? <span>{getResourceTypeDisplayName(selectedResource)}</span> : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="common-resource-empty">Enter an API token and load resources.</div>
        )}
      </section>

      <nav className="tab-bar" aria-label={text.mainViews}>
        <button
          type="button"
          className={activeTab === 'upload' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('upload')}
        >
          {text.tabUpload}
        </button>
        <button
          type="button"
          className={activeTab === 'search' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('search')}
        >
          {text.tabSearch}
        </button>
      </nav>

      {activeTab === 'upload' ? (
        <section className="content-grid upload-content-grid">
          <section className="details-panel">
            {selectedResource ? (
              <UploadWorkspace
                isLoadingProfile={isLoadingProfile}
                isUploading={isUploading}
                metadataFormRef={metadataFormRef}
                metadataValid={metadataValid}
                metadataValidationSummary={metadataValidationSummary}
                profile={profile}
                resource={selectedResource}
                selectedLanguage={selectedLanguage}
                serviceLabel={coscineService.label}
                selectedFiles={selectedFiles}
                targetPath={targetPath}
                uploadButtonLabel={text.uploadFile}
                onFilesChange={(files) => {
                  setSelectedFiles(files);
                  setTargetPath(files.length === 1 ? files[0].name : '');
                }}
                onMetadataChange={setMetadataContent}
                onMetadataValidChange={setMetadataValid}
                onMetadataValidationSummaryChange={setMetadataValidationSummary}
                onRememberedFieldPathsChange={setRememberedFieldPaths}
                onRememberedFieldsChange={setFormMemoryFields}
                onTargetPathChange={setTargetPath}
                onUpload={uploadToCoscine}
                formMemoryFields={formMemoryFields}
                rememberedFieldPaths={rememberedFieldPaths}
              />
            ) : (
              <div className="empty-state">Select a resource to prepare a file upload.</div>
            )}
          </section>
        </section>
      ) : activeTab === 'search' ? (
        <SearchView
          apiToken={apiToken}
          isLoadingSelection={isLoadingSearchSelection}
          profile={searchProfile}
          resourceDetails={searchResourceDetails}
          selectedLanguage={selectedLanguage}
          rangeFilters={searchRangeFilters}
          selectedResource={selectedResource}
          service={coscineService}
          onFilterRdfChange={setSearchFilterRdf}
          onRangeFiltersChange={setSearchRangeFilters}
        />
      ) : null}
    </main>
    </AppTextContext.Provider>
  );
}

function LanguageSelector({ language, onLanguageChange }) {
  return (
    <div className="global-language-selector" aria-label="Global language selection">
      {GLOBAL_LANGUAGE_OPTIONS.map((option) => (
        <button
          type="button"
          className={
            language === option.value
              ? 'global-language-selector__button selected'
              : 'global-language-selector__button'
          }
          key={option.value}
          onClick={() => onLanguageChange(option.value)}
          aria-pressed={language === option.value}
          aria-label={option.label}
          title={option.label}
        >
          <img
            className="global-language-selector__icon"
            src={option.iconSrc}
            alt=""
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

function SearchView({
  apiToken,
  isLoadingSelection,
  onFilterRdfChange,
  onRangeFiltersChange,
  profile,
  rangeFilters,
  resourceDetails,
  selectedLanguage,
  selectedResource,
  service,
}) {
  const text = useAppText();
  const [localFilterRdf, setLocalFilterRdf] = useState('');
  const files = resourceDetails?.files ?? EMPTY_SEARCH_FILES;
  const filteredFiles = useMemo(
    () => applyRangeFilters(filterFiles(files, localFilterRdf), rangeFilters),
    [files, localFilterRdf, rangeFilters],
  );
  const handleFilterRdfChange = useCallback((value) => {
    setLocalFilterRdf(value);
    onFilterRdfChange(value);
  }, [onFilterRdfChange]);

  useEffect(() => {
    setLocalFilterRdf('');
  }, [selectedResource?.projectId, selectedResource?.resourceId]);

  return (
    <section className="search-page">
      <section className="search-resource-surface">
        {selectedResource ? (
          <SearchResourceWorkspace
            apiToken={apiToken}
            files={filteredFiles}
            hasSearched={Boolean(resourceDetails)}
            isLoading={isLoadingSelection}
            onFilterRdfChange={handleFilterRdfChange}
            onRangeFiltersChange={onRangeFiltersChange}
            profile={profile}
            resource={selectedResource}
            searchSourceFiles={files}
            selectedLanguage={selectedLanguage}
            service={service}
          />
        ) : (
          <div className="empty-state">{text.selectResourcePrompt}</div>
        )}
      </section>
    </section>
  );
}

function SearchResourceWorkspace({
  apiToken,
  files,
  hasSearched,
  isLoading,
  onFilterRdfChange,
  onRangeFiltersChange,
  profile,
  resource,
  searchSourceFiles,
  selectedLanguage,
  service,
}) {
  const text = useAppText();
  const resourceHasFiles = searchSourceFiles.length > 0;
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [filePage, setFilePage] = useState(1);
  const filePageCount = Math.max(1, Math.ceil(files.length / FILE_LIST_PAGE_SIZE));
  const safeFilePage = Math.min(filePage, filePageCount);
  const visibleFiles = useMemo(
    () => files.slice(
      (safeFilePage - 1) * FILE_LIST_PAGE_SIZE,
      safeFilePage * FILE_LIST_PAGE_SIZE,
    ),
    [files, safeFilePage],
  );
  const selectedFile = useMemo(
    () => visibleFiles.find((file) => searchFilePath(file) === selectedFilePath) ?? null,
    [selectedFilePath, visibleFiles],
  );
  const filePreviewIcons = useFilePreviewIcons({
    apiToken,
    files: visibleFiles,
    resource,
    service,
  });

  useEffect(() => {
    setSelectedFilePath('');
    setFilePage(1);
    onFilterRdfChange('');
    onRangeFiltersChange({});
  }, [onFilterRdfChange, onRangeFiltersChange, resource.projectId, resource.resourceId]);

  useEffect(() => {
    setFilePage(1);
  }, [files]);

  useEffect(() => {
    if (!visibleFiles.length) {
      setSelectedFilePath('');
      return;
    }

    if (!selectedFilePath || !visibleFiles.some((file) => searchFilePath(file) === selectedFilePath)) {
      setSelectedFilePath(searchFilePath(visibleFiles[0]));
    }
  }, [selectedFilePath, visibleFiles]);

  return (
    <>
      <div className={`search-workspace-layout${resourceHasFiles ? '' : ' without-search-form'}`}>
        {resourceHasFiles ? (
          <MetadataFilterForm
            isLoading={isLoading}
            onRangeFiltersChange={onRangeFiltersChange}
            profile={profile}
            rawFiles={searchSourceFiles}
            resource={resource}
            selectedLanguage={selectedLanguage}
            onFilterRdfChange={onFilterRdfChange}
          />
        ) : null}
          <section className="file-browser-panel">
            <div className="file-browser-grid">
              <FileTable
                currentPage={safeFilePage}
                files={visibleFiles}
                hasSearched={hasSearched}
                isLoading={isLoading}
                onPageChange={setFilePage}
                previewIcons={filePreviewIcons}
                profile={profile}
                selectedLanguage={selectedLanguage}
                selectedFilePath={selectedFilePath}
                totalPages={filePageCount}
                onSelectFile={(file) => setSelectedFilePath(searchFilePath(file))}
              />
              <FilePreview
                apiToken={apiToken}
                file={selectedFile}
                profile={profile}
                resource={resource}
                selectedLanguage={selectedLanguage}
                service={service}
              />
            </div>
          </section>
        </div>
    </>
  );
}

function MetadataFilterForm({
  isLoading,
  onFilterRdfChange,
  onRangeFiltersChange,
  profile,
  rawFiles,
  resource,
  selectedLanguage,
}) {
  const text = useAppText();
  const formKey = `${resource.projectId}:${resource.resourceId}:${profile?.baseUri ?? 'none'}`;
  const numericRangeStats = useMemo(() => buildNumericRangeStats(rawFiles), [rawFiles]);
  const observedMetadataValues = useMemo(() => buildObservedMetadataValueMap(rawFiles), [rawFiles]);
  return (
    <section className="form-panel">
      {isLoading && !profile?.shapes ? <p className="muted">{text.loadingShaclForm}</p> : null}
      {!isLoading && !profile?.shapes ? (
        <p className="muted">No SHACL application profile is available for this resource.</p>
      ) : null}
      {profile?.shapes ? (
        <SearchShaclFormHost
          key={formKey}
          numericRangeStats={numericRangeStats}
          observedMetadataValues={observedMetadataValues}
          shapes={profile.shapes}
          selectedLanguage={selectedLanguage}
          onRangeFiltersChange={onRangeFiltersChange}
          onSerializedChange={onFilterRdfChange}
        />
      ) : null}
    </section>
  );
}

function SearchShaclFormHost({
  numericRangeStats,
  observedMetadataValues,
  onRangeFiltersChange,
  onSerializedChange,
  selectedLanguage,
  shapes,
}) {
  const text = useAppText();
  const fields = useMemo(
    () => buildNativeSearchFields(shapes, observedMetadataValues, numericRangeStats, selectedLanguage),
    [numericRangeStats, observedMetadataValues, selectedLanguage, shapes],
  );

  useEffect(() => {
    console.info('[Coscine search] Fields constructed', {
      fieldCount: fields.length,
      observedMetadataPaths: Array.from(observedMetadataValues.keys()),
      numericRangePaths: Array.from(numericRangeStats.keys()),
      fields: fields.map((field) => ({
        kind: field.kind,
        label: field.label,
        path: field.path,
        valueCount: field.values?.length ?? 0,
      })),
    });
  }, [fields, numericRangeStats, observedMetadataValues]);
  const [textValues, setTextValues] = useState({});
  const [showReadonlyFields, setShowReadonlyFields] = useState(false);
  const [rangeValues, setRangeValues] = useState(() =>
    Object.fromEntries(
      fields
        .filter((field) => field.kind === 'range')
        .map((field) => [field.path, [field.proposedMin, field.proposedMax]]),
    ),
  );
  const rangeLabels = getRangeLabels(selectedLanguage);
  const hasReadonlyFields = fields.some((field) => field.kind === 'readonly');
  const visibleFields = showReadonlyFields
    ? fields
    : fields.filter((field) => field.kind !== 'readonly');

  useEffect(() => {
    setShowReadonlyFields(false);
  }, [shapes]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onSerializedChange(
        JSON.stringify(
          Object.entries(textValues)
            .filter(([, fieldValue]) => String(fieldValue).trim() !== '')
            .map(([fieldPath, fieldValue]) => ({ path: fieldPath, value: fieldValue })),
        ),
      );
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [onSerializedChange, textValues]);

  const updateTextFilter = (path, value) => {
    setTextValues((values) => ({ ...values, [path]: value }));
  };

  const updateRangeFilter = (field, index, value) => {
    const current = rangeValues[field.path] ?? [field.proposedMin, field.proposedMax];
    const nextRange = [...current];
    nextRange[index] = value;
    setRangeValues((ranges) => ({ ...ranges, [field.path]: nextRange }));
    const normalizeBound = (bound) => field.inputType === 'number' && bound !== '' ? Number(bound) : bound;

    onRangeFiltersChange((filters) => {
      const nextFilters = { ...filters };
      if (nextRange.every((bound) => bound === '')) {
        delete nextFilters[field.path];
      } else {
        nextFilters[field.path] = nextRange.map(normalizeBound);
      }
      return nextFilters;
    });
  };

  return (
    <div className="native-search-form">
      <div className="native-search-fields-scroll">
        {visibleFields.map((field) => (
          <div
            className={`native-search-field${field.kind === 'readonly' ? ' is-readonly' : ''}`}
            key={field.path}
            title={field.description || undefined}
          >
          <label htmlFor={field.id}>{field.label}</label>
          {field.kind === 'readonly' ? (
            <input id={field.id} readOnly value={field.displayValue} />
          ) : field.kind === 'select' ? (
            <select
              id={field.id}
              value={textValues[field.path] ?? ''}
              onChange={(event) => updateTextFilter(field.path, event.target.value)}
            >
              <option value="">Any</option>
              {field.values.map((value) => (
                <option key={value} value={value}>{compactMetadataUri(value)}</option>
              ))}
            </select>
          ) : field.kind === 'range' ? (
            <div className="native-search-range">
              <label>
                <span>{rangeLabels.from}</span>
                <input
                  type={field.inputType}
                  value={rangeValues[field.path]?.[0] ?? ''}
                  onChange={(event) => updateRangeFilter(field, 0, event.target.value)}
                />
              </label>
              <label>
                <span>{rangeLabels.to}</span>
                <input
                  type={field.inputType}
                  value={rangeValues[field.path]?.[1] ?? ''}
                  onChange={(event) => updateRangeFilter(field, 1, event.target.value)}
                />
              </label>
            </div>
          ) : (
            <input
              id={field.id}
              type="text"
              value={textValues[field.path] ?? ''}
              onChange={(event) => updateTextFilter(field.path, event.target.value)}
            />
          )}
          </div>
        ))}
        {!fields.length ? <p className="muted">{text.noFilterFields}</p> : null}
      </div>
      {hasReadonlyFields ? (
        <label className="native-search-readonly-toggle">
          <input
            type="checkbox"
            checked={showReadonlyFields}
            onChange={(event) => setShowReadonlyFields(event.target.checked)}
          />
          <span>{text.showReadonlyFields}</span>
        </label>
      ) : null}
    </div>
  );
}

function FileTable({
  currentPage,
  files,
  hasSearched,
  isLoading,
  onPageChange,
  onSelectFile,
  previewIcons,
  profile,
  selectedFilePath,
  selectedLanguage,
  totalPages,
}) {
  const text = useAppText();
  const metadataLabelsByPath = useMemo(
    () => collectShapeLabelsByPath(profile?.shapes, selectedLanguage),
    [profile?.shapes, selectedLanguage],
  );
  const metadataSummaries = useMemo(
    () => new Map(
      files.map((file) => [
        file,
        buildCoreMetadataSummary(file.metadata, metadataLabelsByPath, selectedLanguage),
      ]),
    ),
    [files, metadataLabelsByPath, selectedLanguage],
  );

  return (
    <section className="files-panel">
      {files.length ? (
        <div className="file-result-list" role="listbox" aria-label={text.files}>
          {files.map((file, index) => {
            const path = searchFilePath(file);
            const selected = selectedFilePath === path;
            const fileSize = getSearchFileSize(file);
            const fileType = getSearchFileType(file, path);
            const metadataSummary = metadataSummaries.get(file);
            const previewIcon = previewIcons.get(path);
            const extension = path.includes('.') ? path.split('.').pop().slice(0, 5).toUpperCase() : 'FILE';

            return (
              <button
                aria-selected={selected}
                aria-busy={previewIcon?.status === 'loading'}
                className={selected ? 'file-result-button selected' : 'file-result-button'}
                key={`${path}-${index}`}
                role="option"
                type="button"
                onClick={() => onSelectFile(file)}
              >
                <span className="file-result-content">
                  <strong title={path || undefined}>{metadataSummary.title}</strong>
                  <span className="file-result-metadata-summary">
                    {metadataSummary.detailItems.length
                      ? metadataSummary.detailItems.map((item, detailIndex) => (
                        <React.Fragment key={item.label}>
                          {detailIndex ? ' · ' : ''}<b>{item.label}:</b> {item.value}
                        </React.Fragment>
                      ))
                      : [
                        fileType,
                        Number.isFinite(fileSize) ? formatBytes(fileSize) : '',
                      ].filter(Boolean).join(' · ') || 'Metadata record'}
                  </span>
                </span>
                <span className={`file-result-thumbnail${previewIcon?.status === 'loading' ? ' is-loading' : ''}`}>
                  {previewIcon?.url
                    ? <img src={previewIcon.url} alt="" />
                    : <span>{extension}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-state search-empty-results">
          {isLoading
            ? text.searching
            : hasSearched
              ? text.noMatchingFiles
              : 'Search results appear as you fill the metadata form.'}
        </div>
      )}
      {files.length && totalPages > 1 ? (
        <div className="file-list-pagination" aria-label="File list pages">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="Previous file page"
          >‹</button>
          <span>{currentPage} / {totalPages}</span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            aria-label="Next file page"
          >›</button>
        </div>
      ) : null}
    </section>
  );
}

function useFilePreviewIcons({ apiToken, files, resource, service }) {
  const [previewIcons, setPreviewIcons] = useState(() => new Map());

  useEffect(() => {
    let active = true;
    let queueIndex = 0;
    const objectUrls = new Set();
    const controllers = new Set();
    const descriptors = files
      .map((file) => {
        const path = searchFilePath(file);
        return path ? {
          file,
          path,
          key: filePreviewCacheKey(resource.projectId, resource.resourceId, path),
          fingerprint: filePreviewFingerprint(file, path),
        } : null;
      })
      .filter(Boolean);

    setPreviewIcons(new Map(descriptors.map(({ path }) => [path, { status: 'queued', url: '' }])));

    const setEntry = (path, entry) => {
      if (!active) return;
      setPreviewIcons((current) => {
        const next = new Map(current);
        next.set(path, entry);
        return next;
      });
    };

    const useBlob = (path, blob) => {
      if (!active) return;
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      setEntry(path, { status: 'ready', url });
    };

    const createMissingPreview = async (descriptor) => {
      await waitForBackgroundTurn();
      if (!active) return;
      setEntry(descriptor.path, { status: 'loading', url: '' });
      const declaredType = String(
        descriptor.file?.fileType ?? descriptor.file?.contentType ?? descriptor.file?.mimeType ?? '',
      );
      const contentType = declaredType || inferContentTypeFromPath(descriptor.path);
      const kind = getPreviewKind(contentType, descriptor.path);
      const needsDownload = kind === 'image' || kind === 'text'
        || (kind === 'tabular' && isDelimitedTabularFile(contentType, descriptor.path));
      let blob;
      let shouldCache = true;

      try {
        if (needsDownload) {
          const controller = new AbortController();
          controllers.add(controller);
          try {
            const response = await service.downloadFile(apiToken, {
              projectId: resource.projectId,
              resourceId: resource.resourceId,
              path: descriptor.path,
              signal: controller.signal,
            });
            blob = await createFileListPreview({ response, path: descriptor.path, kind, contentType });
          } finally {
            controllers.delete(controller);
          }
        } else {
          blob = createTypeThumbnail(descriptor.path, kind);
        }
      } catch (error) {
        if (!active || error?.name === 'AbortError') return;
        blob = createTypeThumbnail(descriptor.path, kind);
        shouldCache = false;
      }

      if (!active) return;
      if (shouldCache) await cacheFilePreview({ ...descriptor, blob });
      useBlob(descriptor.path, blob);
    };

    const run = async () => {
      const cached = await readCachedFilePreviews(descriptors);
      if (!active) return;
      const missing = [];

      for (const descriptor of descriptors) {
        const blob = cached.get(descriptor.key);
        if (blob) useBlob(descriptor.path, blob);
        else missing.push(descriptor);
      }

      const worker = async () => {
        while (active && queueIndex < missing.length) {
          const descriptor = missing[queueIndex];
          queueIndex += 1;
          await createMissingPreview(descriptor);
        }
      };

      await Promise.all([worker(), worker()]);
    };

    run().catch(() => {});

    return () => {
      active = false;
      for (const controller of controllers) controller.abort();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [apiToken, files, resource.projectId, resource.resourceId, service]);

  return previewIcons;
}

function waitForBackgroundTurn() {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(resolve, { timeout: 500 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

function FilePreview({ apiToken, file, profile, resource, selectedLanguage, service }) {
  const text = useAppText();
  const [previewState, setPreviewState] = useState({
    error: '',
    isTruncated: false,
    isLoading: false,
    kind: 'empty',
    objectUrl: '',
    tabularPreview: null,
    text: '',
    type: '',
  });
  const path = searchFilePath(file);
  const metadataRows = useMemo(
    () => buildFileMetadataRows(file?.metadata, profile?.shapes, selectedLanguage),
    [file?.metadata, profile?.shapes, selectedLanguage],
  );

  useEffect(() => {
    let isActive = true;
    let objectUrl = '';
    const previewController = new AbortController();

    if (!file) {
      setPreviewState({
        error: '',
        isTruncated: false,
        isLoading: false,
        kind: 'empty',
        objectUrl: '',
        tabularPreview: null,
        text: '',
        type: '',
      });
      return undefined;
    }

    setPreviewState({
      error: '',
      isTruncated: false,
      isLoading: true,
      kind: 'loading',
      objectUrl: '',
      tabularPreview: null,
      text: '',
      type: '',
    });

    service.downloadFile(apiToken, {
      projectId: resource.projectId,
      resourceId: resource.resourceId,
      path,
      signal: previewController.signal,
    })
      .then(async (response) => {
        const type = response.headers.get('content-type') || inferContentTypeFromPath(path);
        const kind = getPreviewKind(type, path);
        let blob = null;
        let tabularPreview = null;

        if (kind === 'tabular' && isDelimitedTabularFile(type, path)) {
          const rawText = await response.text();
          const byteLength = new TextEncoder().encode(rawText).byteLength;
          if (byteLength > MAX_TABULAR_PREVIEW_BYTES) {
            throw new Error('This tabular file is too large to preview safely in the browser.');
          }
          const { parseDelimitedPreview } = await import('./delimitedPreview.js');
          tabularPreview = parseDelimitedPreview(rawText, path);
        } else {
          blob = await response.blob();
        }

        objectUrl = kind === 'image' || kind === 'pdf' ? URL.createObjectURL(blob) : '';
        const needsText = kind === 'text';
        const isByteTruncated = needsText && blob?.size > MAX_TEXT_PREVIEW_BYTES;
        const previewBlob = isByteTruncated ? blob.slice(0, MAX_TEXT_PREVIEW_BYTES) : blob;
        const rawText = needsText ? await previewBlob.text() : '';

        if (kind === 'tabular' && !tabularPreview) {
          if (blob.size > MAX_TABULAR_PREVIEW_BYTES) {
            throw new Error('This tabular file is too large to preview safely in the browser.');
          }
          const { parseTabularPreview } = await import('./tabularPreview.js');
          tabularPreview = parseTabularPreview(await blob.arrayBuffer());
        }

        const isTruncated = isByteTruncated || Boolean(
          tabularPreview && !tabularPreview.getPage && tabularPreview.rowCount > tabularPreview.rows.length,
        );
        const text = kind === 'text'
          ? `${rawText}${isTruncated ? '\n\n… Preview truncated.' : ''}`
          : '';
        if (!isActive) {
          return;
        }

        setPreviewState({
          error: '',
          isTruncated,
          isLoading: false,
          kind,
          objectUrl,
          tabularPreview,
          text,
          type,
        });
      })
      .catch((previewError) => {
        if (!isActive || previewError?.name === 'AbortError') {
          return;
        }

        setPreviewState({
          error: previewError.message || 'Could not load the file preview.',
          isTruncated: false,
          isLoading: false,
          kind: 'error',
          objectUrl: '',
          tabularPreview: null,
          text: '',
          type: '',
        });
      });

    return () => {
      isActive = false;
      previewController.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [apiToken, file, path, resource.projectId, resource.resourceId, service]);

  return (
    <section className="file-preview-panel">
      {file ? (
        <div className="file-preview-actions">
          <button
            className="inspector-download-button"
            type="button"
            onClick={() => downloadSearchFile({ apiToken, file, resource, service })}
          >
            {text.download}
          </button>
        </div>
      ) : null}

      {!file ? <div className="empty-state inspector-empty-state">{text.selectFilePrompt}</div> : null}
      {file && previewState.isLoading ? <div className="empty-state">{text.loadingPreview}</div> : null}
      {file && previewState.kind === 'error' ? <div className="alert preview-alert">{previewState.error}</div> : null}
      {file && previewState.kind === 'image' ? (
        <div className="file-preview-media">
          <img src={previewState.objectUrl} alt={path} />
        </div>
      ) : null}
      {file && previewState.kind === 'pdf' ? (
        <iframe className="file-preview-frame" src={previewState.objectUrl} title={path} />
      ) : null}
      {file && previewState.kind === 'text' ? (
        <pre className="file-preview-text">{previewState.text || 'The file is empty.'}</pre>
      ) : null}
      {file && previewState.kind === 'tabular' ? (
        <TabularPreviewTable preview={previewState.tabularPreview} isTruncated={previewState.isTruncated} />
      ) : null}
      {file && previewState.kind === 'unsupported' ? (
        <dl className="upload-facts upload-facts-compact">
          <div>
            <dt>File</dt>
            <dd>{path}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{previewState.type || 'Unknown'}</dd>
          </div>
        </dl>
      ) : null}

      {file ? (
        <section className="file-metadata">
          {metadataRows.length ? (
            <dl className="file-metadata__list">
              {metadataRows.map((row) => (
                <div key={row.path}>
                  <dt title={row.path}>{row.label}</dt>
                  <dd>{row.values.join(', ')}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">{text.noReadableMetadata}</p>
          )}
        </section>
      ) : null}
    </section>
  );
}

async function downloadSearchFile({ apiToken, file, resource, service }) {
  const path = searchFilePath(file);

  try {
    const response = await service.downloadFile(apiToken, {
      projectId: resource.projectId,
      resourceId: resource.resourceId,
      path,
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = path.split('/').pop() || 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (downloadError) {
    window.alert(downloadError.message || 'Could not download file.');
  }
}

function TabularPreviewTable({ preview, isTruncated }) {
  const headers = preview?.headers ?? [];
  const rows = preview?.rows ?? [];
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(preview.rowCount / TABULAR_PREVIEW_PAGE_ROWS));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const firstRowIndex = (safeCurrentPage - 1) * TABULAR_PREVIEW_PAGE_ROWS;
  const visibleRows = useMemo(
    () => preview.getPage
      ? preview.getPage(safeCurrentPage, TABULAR_PREVIEW_PAGE_ROWS)
      : rows.slice(firstRowIndex, firstRowIndex + TABULAR_PREVIEW_PAGE_ROWS),
    [firstRowIndex, preview, rows, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [preview]);

  if (!headers.length) {
    return <div className="empty-state">The tabular file is empty.</div>;
  }

  return (
    <div className="tabular-preview">
      <div className="tabular-preview__summary">
        <span>
          {preview.rowCount
            ? `${firstRowIndex + 1}–${firstRowIndex + visibleRows.length} of ${preview.rowCount}`
            : '0'} row{preview.rowCount === 1 ? '' : 's'}
          {preview.sheetName ? ` · ${preview.sheetName}` : ''}
        </span>
        {totalPages > 1 ? (
          <div className="tabular-preview__pagination" aria-label="Table pages">
            <button
              type="button"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              aria-label="Previous table page"
            >‹</button>
            <span>{safeCurrentPage} / {totalPages}</span>
            <button
              type="button"
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              aria-label="Next table page"
            >›</button>
          </div>
        ) : isTruncated ? <span>Preview truncated</span> : null}
      </div>
      {preview.layoutNote ? <p className="tabular-preview__layout-note">{preview.layoutNote}</p> : null}
      <div className="tabular-preview__scroll">
        <table>
          <thead>
            <tr>
              {headers.map((cell, index) => (
                <th key={`header-${index}`} title={cell}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={`row-${firstRowIndex + rowIndex}`}>
                {headers.map((_, columnIndex) => {
                  const cell = row[columnIndex] ?? '';
                  return <td key={`cell-${firstRowIndex + rowIndex}-${columnIndex}`} title={cell}>{cell}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getPreviewKind(contentType, path) {
  const normalizedType = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  const normalizedPath = String(path ?? '').toLowerCase();

  if (normalizedType.startsWith('image/')) {
    return 'image';
  }

  if (normalizedType === 'application/pdf' || normalizedPath.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    [
      'text/csv',
      'text/tab-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroenabled.12',
      'application/vnd.ms-excel.sheet.binary.macroenabled.12',
      'application/vnd.oasis.opendocument.spreadsheet',
    ].includes(normalizedType) ||
    /\.(csv|tsv|xls|xlsx|xlsm|xlsb|ods|html?|htm)$/i.test(normalizedPath)
  ) {
    return 'tabular';
  }

  if (
    normalizedType.startsWith('text/') ||
    [
      'application/json',
      'application/ld+json',
      'application/xml',
      'application/xhtml+xml',
      'application/javascript',
      'application/x-javascript',
      'application/n-triples',
      'application/n-quads',
      'text/turtle',
    ].includes(normalizedType) ||
    /\.(json|jsonld|md|n3|nt|ttl|txt|xml|yaml|yml)$/i.test(normalizedPath)
  ) {
    return 'text';
  }

  return 'unsupported';
}

function isDelimitedTabularFile(contentType, path) {
  const normalizedType = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  return (
    ['text/csv', 'text/tab-separated-values', 'application/csv'].includes(normalizedType) ||
    /\.(csv|tsv)$/i.test(String(path ?? ''))
  );
}

function inferContentTypeFromPath(path) {
  const normalizedPath = String(path ?? '').toLowerCase();

  if (normalizedPath.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (/\.(apng|avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedPath)) {
    return `image/${normalizedPath.split('.').pop().replace('jpg', 'jpeg')}`;
  }

  const tabularTypes = {
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
  };
  const extension = normalizedPath.split('.').pop();
  if (tabularTypes[extension]) {
    return tabularTypes[extension];
  }

  if (/\.(html?|json|jsonld|md|n3|nt|ttl|txt|xml|yaml|yml)$/i.test(normalizedPath)) {
    return 'text/plain';
  }

  return '';
}

function filterFiles(files, filterRdf) {
  const filters = parseFieldFilters(filterRdf);

  if (!filters.length) {
    return files;
  }

  return files.filter((file) => {
    const metadataValues = extractTextMetadataValueMap(file.metadata);
    const haystack = `${file.path ?? ''}\n${JSON.stringify(file.metadata ?? '')}`.toLowerCase();

    return filters.every(({ path, value }) => {
      const terms = splitTextFilterTerms(value);

      if (!path) {
        return terms.every((term) => haystack.includes(term));
      }

      const values = findTextMetadataValues(metadataValues, path);

      return terms.every((term) => values.some((metadataValue) => metadataValue.includes(term)));
    });
  });
}

function splitTextFilterTerms(value) {
  return Array.from(
    new Set(
      normalizeTextFilterValue(value)
        .split(/\s+/)
        .filter(Boolean),
    ),
  );
}

function parseFieldFilters(filterText) {
  if (!filterText) {
    return [];
  }

  try {
    const parsed = JSON.parse(filterText);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry) => entry?.path && entry?.value !== undefined)
        .map((entry) => ({
          path: entry.path,
          value: String(entry.value ?? '').trim().replace(/^<|>$/g, ''),
        }))
        .filter((entry) => entry.value !== '');
    }
  } catch {
    return extractFilterTerms(filterText).map((term) => ({ path: null, value: term }));
  }

  return [];
}

function normalizeTextFilterValue(value) {
  return String(value ?? '').trim().replace(/^<|>$/g, '').toLowerCase();
}

function findTextMetadataValues(valueMap, fieldPath) {
  const directValues = valueMap.get(fieldPath);

  if (directValues) {
    return directValues;
  }

  const normalizedFieldPath = normalizeRangePath(fieldPath);
  const matchingEntries = Array.from(valueMap.entries()).filter(
    ([metadataPath]) => normalizeRangePath(metadataPath) === normalizedFieldPath,
  );

  return matchingEntries.length === 1 ? matchingEntries[0][1] : [];
}

function collectSearchFormFilterText(formElement, dirtyPaths = null) {
  const root = formElement.shadowRoot ?? formElement;
  const values = Array.from(root.querySelectorAll('.property-instance[data-path] .editor'))
    .filter((editor) => !isRangeEditor(editor))
    .map((editor) => {
      const path = editor.closest('.property-instance[data-path]')?.dataset.path;
      const value = getEditorCurrentValue(editor);
      return path && (!dirtyPaths || dirtyPaths.has(path)) && value !== '' ? { path, value } : null;
    })
    .filter(Boolean);

  return JSON.stringify(values);
}

function getSearchFilterEventPath(event) {
  if (!event) {
    return '';
  }

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const item of path) {
    if (item?.dataset?.path) {
      return item.dataset.path;
    }

    const propertyInstance = item?.closest?.('.property-instance[data-path]');
    if (propertyInstance?.dataset?.path) {
      return propertyInstance.dataset.path;
    }
  }

  const target = event.target;
  if (target?.dataset?.path) {
    return target.dataset.path;
  }

  return target?.closest?.('.property-instance[data-path]')?.dataset?.path || '';
}

function applyRangeFilters(files, filters) {
  const activeFilters = Object.entries(filters);

  if (!activeFilters.length) {
    return files;
  }

  return files.filter((file) => {
    const valueMap = extractRangeMetadataValueMap(file.metadata);

    return activeFilters.every(([path, [min, max]]) => {
      const values = findRangeMetadataValues(valueMap, path);

      return values.some((value) => Number.isFinite(value) && value >= min && value <= max);
    });
  });
}

function findRangeMetadataValues(valueMap, fieldPath) {
  const directValues = valueMap.get(fieldPath);

  if (directValues) {
    return directValues;
  }

  const normalizedFieldPath = normalizeRangePath(fieldPath);
  const matchingEntries = Array.from(valueMap.entries()).filter(
    ([metadataPath]) => normalizeRangePath(metadataPath) === normalizedFieldPath,
  );

  return matchingEntries.length === 1 ? matchingEntries[0][1] : [];
}

function enhanceRangeFields(
  formElement,
  onRangeFiltersChange,
  numericRangeStats = new Map(),
  rangeLabels = getRangeLabels(),
) {
  const root = formElement.shadowRoot ?? formElement;
  ensureRangeFieldStyles(root);
  const editors = Array.from(root.querySelectorAll('.property-instance[data-path] .editor')).filter((editor) =>
    isRangeEditor(editor),
  );

  for (const editor of editors) {
    if (editor.dataset.rangeEnhanced === 'true') {
      continue;
    }

    const propertyInstance = editor.closest('.property-instance[data-path]');
    const path = propertyInstance?.dataset.path;
    const field = editor.closest('[part="field"]') ?? editor.parentElement;

    if (!path || !field) {
      continue;
    }

    field.classList.add('metadata-range-field');

    const rangeStats = findNumericRangeStats(numericRangeStats, path);

    editor.dataset.rangeEnhanced = 'true';
    editor.dataset.rangeRole = 'min';

    if (isNumericRangeEditor(editor) && rangeStats?.count > 0 && rangeStats.min <= rangeStats.max) {
      enhanceNumericSliderRangeField({
        editor,
        formElement,
        max: rangeStats.max,
        min: rangeStats.min,
        onRangeFiltersChange,
        path: rangeStats.path,
        rangeLabels,
      });
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'metadata-range-inline';
    const inputType = getRangeInputType(editor);
    const originalDisplay = editor.style.display;
    editor.style.display = 'none';
    editor.dataset.rangeOriginalDisplay = originalDisplay;

    const fromControl = document.createElement('label');
    fromControl.className = 'metadata-range-inline__control';
    fromControl.textContent = rangeLabels.from;

    const fromInput = document.createElement('input');
    fromInput.className = 'metadata-range-inline__input';
    fromInput.type = inputType;
    fromInput.step = editor.step || (inputType === 'number' ? 'any' : '1');
    fromInput.min = editor.min || '';
    fromInput.max = editor.max || '';
    fromInput.placeholder = rangeLabels.from;
    fromInput.dataset.rangeRole = 'min';
    fromInput.dataset.path = path;
    fromInput.setAttribute('aria-label', rangeLabels.from);
    fromControl.appendChild(fromInput);

    const toControl = document.createElement('label');
    toControl.className = 'metadata-range-inline__control';
    toControl.textContent = rangeLabels.to;

    const toInput = document.createElement('input');
    toInput.className = 'metadata-range-inline__input';
    toInput.type = inputType;
    toInput.step = editor.step || (inputType === 'number' ? 'any' : '1');
    toInput.min = editor.min || '';
    toInput.max = editor.max || '';
    toInput.placeholder = rangeLabels.to;
    toInput.dataset.rangeRole = 'max';
    toInput.dataset.path = path;
    toInput.setAttribute('aria-label', rangeLabels.to);
    toControl.appendChild(toInput);

    if (
      (inputType === 'date' || inputType === 'datetime-local') &&
      rangeStats?.count > 0 &&
      rangeStats.min <= rangeStats.max
    ) {
      const proposedMin = rangeValueToFormInput(rangeStats.min, inputType);
      const proposedMax = rangeValueToFormInput(rangeStats.max, inputType);

      fromInput.value = proposedMin;
      fromInput.min = proposedMin;
      fromInput.max = proposedMax;
      toInput.value = proposedMax;
      toInput.min = proposedMin;
      toInput.max = proposedMax;
    }

    editor.parentNode.insertBefore(wrapper, editor);
    wrapper.appendChild(editor);
    wrapper.appendChild(fromControl);
    wrapper.appendChild(toControl);

    const publishRange = () => {
      const min = formInputToRangeValue(fromInput);
      const max = formInputToRangeValue(toInput);

      onRangeFiltersChange((currentFilters) => {
        const nextFilters = { ...currentFilters };

        if (Number.isFinite(min) || Number.isFinite(max)) {
          nextFilters[path] = [
            Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY,
            Number.isFinite(max) ? max : Number.POSITIVE_INFINITY,
          ];
        } else {
          delete nextFilters[path];
        }

        return nextFilters;
      });
      formElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    };

    fromInput.addEventListener('input', publishRange);
    fromInput.addEventListener('change', publishRange);
    toInput.addEventListener('input', publishRange);
    toInput.addEventListener('change', publishRange);
  }
}

function enhanceNumericSliderRangeField({
  editor,
  formElement,
  max,
  min,
  onRangeFiltersChange,
  path,
  rangeLabels,
}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'metadata-slider-filter';

  const originalDisplay = editor.style.display;
  editor.style.display = 'none';
  editor.dataset.sliderOriginalDisplay = originalDisplay;
  editor.parentNode.insertBefore(wrapper, editor);
  wrapper.appendChild(editor);

  if (min === max) {
    hideSingleValueRangeAddControl(editor);
    const onlyValue = document.createElement('input');
    onlyValue.className = 'metadata-slider-filter__single-value';
    onlyValue.type = 'text';
    onlyValue.value = formatSliderValue(min);
    onlyValue.readOnly = true;
    onlyValue.setAttribute('aria-label', onlyValue.value);
    onlyValue.title = rangeLabels.onlyValueHint;

    wrapper.appendChild(onlyValue);
    onRangeFiltersChange((currentFilters) => {
      const currentRange = currentFilters[path];

      if (currentRange?.[0] === min && currentRange?.[1] === max) {
        return currentFilters;
      }

      return {
        ...currentFilters,
        [path]: [min, max],
      };
    });
    return;
  }

  const sliderValues = document.createElement('div');
  sliderValues.className = 'metadata-slider-filter__grid';

  const minLabel = document.createElement('label');
  minLabel.className = 'metadata-slider-filter__label';
  minLabel.textContent = rangeLabels.from;

  const minValue = document.createElement('output');
  minValue.className = 'metadata-slider-filter__value';
  minLabel.appendChild(minValue);

  const minSlider = document.createElement('input');
  minSlider.className = 'metadata-slider-filter__input';
  minSlider.type = 'range';
  minSlider.min = String(min);
  minSlider.max = String(max);
  minSlider.step = getNumericSliderStep(editor);
  minSlider.value = String(min);
  minSlider.setAttribute('orient', 'horizontal');
  minSlider.dataset.path = path;
  minSlider.dataset.rangeRole = 'min';
  minSlider.setAttribute('aria-label', rangeLabels.from);
  const maxLabel = document.createElement('label');
  maxLabel.className = 'metadata-slider-filter__label';
  maxLabel.textContent = rangeLabels.to;

  const maxValue = document.createElement('output');
  maxValue.className = 'metadata-slider-filter__value';
  maxLabel.appendChild(maxValue);

  const maxSlider = document.createElement('input');
  maxSlider.className = 'metadata-slider-filter__input';
  maxSlider.type = 'range';
  maxSlider.min = String(min);
  maxSlider.max = String(max);
  maxSlider.step = minSlider.step;
  maxSlider.value = String(max);
  maxSlider.setAttribute('orient', 'horizontal');
  maxSlider.dataset.path = path;
  maxSlider.dataset.rangeRole = 'max';
  maxSlider.setAttribute('aria-label', rangeLabels.to);

  const sliderRail = document.createElement('div');
  sliderRail.className = 'metadata-slider-filter__rail';
  const selectedRail = document.createElement('div');
  selectedRail.className = 'metadata-slider-filter__selected-rail';
  sliderRail.appendChild(selectedRail);
  sliderRail.appendChild(minSlider);
  sliderRail.appendChild(maxSlider);

  const valueLine = document.createElement('div');
  valueLine.className = 'metadata-slider-filter__values';

  wrapper.appendChild(sliderValues);
  sliderValues.appendChild(minLabel);
  sliderValues.appendChild(maxLabel);
  wrapper.appendChild(sliderRail);
  wrapper.appendChild(valueLine);

  const publishRange = () => {
    let selectedMin = Number(minSlider.value);
    let selectedMax = Number(maxSlider.value);

    if (selectedMin > selectedMax) {
      if (document.activeElement === minSlider) {
        selectedMax = selectedMin;
        maxSlider.value = String(selectedMax);
      } else {
        selectedMin = selectedMax;
        minSlider.value = String(selectedMin);
      }
    }

    const rangeWidth = max - min;
    const selectedStart = ((selectedMin - min) / rangeWidth) * 100;
    const selectedEnd = ((selectedMax - min) / rangeWidth) * 100;
    minValue.value = formatSliderValue(selectedMin);
    minValue.textContent = minValue.value;
    maxValue.value = formatSliderValue(selectedMax);
    maxValue.textContent = maxValue.value;
    selectedRail.style.left = `${selectedStart}%`;
    selectedRail.style.width = `${selectedEnd - selectedStart}%`;
    valueLine.textContent = `${rangeLabels.available}: ${formatSliderValue(min)} ${rangeLabels.to.toLowerCase()} ${formatSliderValue(max)} · ${rangeLabels.selected}: ${formatSliderValue(selectedMin)} ${rangeLabels.to.toLowerCase()} ${formatSliderValue(selectedMax)}`;

    onRangeFiltersChange((currentFilters) => {
      const nextFilters = { ...currentFilters };

      if (selectedMin > min || selectedMax < max) {
        nextFilters[path] = [selectedMin, selectedMax];
      } else {
        delete nextFilters[path];
      }

      return nextFilters;
    });
    formElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  };

  minSlider.addEventListener('input', publishRange);
  minSlider.addEventListener('change', publishRange);
  maxSlider.addEventListener('input', publishRange);
  maxSlider.addEventListener('change', publishRange);
  publishRange();
}

function hideSingleValueRangeAddControl(editor) {
  const property = editor.closest('shacl-property');

  if (!property) {
    return;
  }

  const hideControls = () => {
    for (const control of property.querySelectorAll(':scope > .add-button-wrapper, :scope > [part~="add-controls"]')) {
      control.hidden = true;
      control.dataset.singleValueRangeControl = 'hidden';
    }
  };

  hideControls();

  // The SHACL component adds its controls asynchronously after its editor has
  // rendered. Observe only its direct, documented add-control wrapper so a
  // late “+ Add” button cannot reappear for this fixed-value range.
  if (!editor.singleValueRangeAddControlObserver) {
    const observer = new MutationObserver(hideControls);
    observer.observe(property, { childList: true });
    editor.singleValueRangeAddControlObserver = observer;
  }
}

function ensureRangeFieldStyles(root) {
  if (root.querySelector('#coscine-range-field-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'coscine-range-field-styles';
  style.textContent = `
    .metadata-range-inline {
      align-items: end;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
      gap: 10px;
      width: 100%;
    }

    /* A date range contains two controls. Put the property label above them
       so the range can use the complete form row rather than only the space
       left after the label. */
    .metadata-range-field {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr);
      inline-size: 100%;
      min-inline-size: 0;
    }

    .metadata-range-field > label {
      inline-size: auto !important;
      padding-inline-end: 0 !important;
    }

    .metadata-range-field > .metadata-range-inline,
    .metadata-range-field > .metadata-slider-filter {
      min-inline-size: 0;
      width: 100%;
    }

    .property-instance .metadata-range-inline__control {
      color: #64748b;
      display: grid !important;
      font-size: 0.75rem;
      font-weight: 700;
      gap: 6px;
      inline-size: 100% !important;
      line-height: normal;
      padding: 0 !important;
      position: static;
      word-break: normal;
      white-space: nowrap;
      writing-mode: horizontal-tb !important;
    }

    .metadata-range-inline__input {
      background: #ffffff;
      border: 1px solid #bdc9d8;
      border-radius: 6px;
      box-sizing: border-box;
      color: #142033;
      font: inherit;
      height: 42px;
      min-width: 0;
      padding: 9px 11px;
      width: 100%;
      writing-mode: horizontal-tb !important;
    }

    .metadata-range-inline__input:focus {
      border-color: #0067b1;
      box-shadow: 0 0 0 3px rgba(0, 103, 177, 0.16);
      outline: none;
    }

    .metadata-range-inline__input[type="number"] {
      -moz-appearance: textfield;
      appearance: textfield;
    }

    .metadata-range-inline__input[type="number"]::-webkit-inner-spin-button,
    .metadata-range-inline__input[type="number"]::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .metadata-slider-filter {
      display: grid;
      gap: 8px;
      width: 100%;
    }

    .metadata-slider-filter__grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(4.75rem, 1fr));
    }

    .metadata-slider-filter__label {
      color: #334155;
      display: grid;
      font-size: 0.75rem;
      font-weight: 800;
      gap: 6px;
      min-width: 4.75rem;
      text-transform: uppercase;
      white-space: nowrap;
      writing-mode: horizontal-tb !important;
    }

    .metadata-slider-filter__value {
      color: #142033;
      font-size: 0.9rem;
      font-weight: 700;
      text-transform: none;
    }

    .metadata-slider-filter__rail {
      background: #d8e0ea;
      border-radius: 999px;
      height: 8px;
      margin: 4px 8px;
      position: relative;
    }

    .metadata-slider-filter__selected-rail {
      background: #0067b1;
      border-radius: inherit;
      height: 100%;
      position: absolute;
    }

    .metadata-slider-filter__input {
      appearance: none !important;
      -webkit-appearance: none !important;
      background: transparent;
      cursor: pointer;
      inset: -8px;
      margin: 0;
      pointer-events: none;
      position: absolute;
      direction: ltr !important;
      height: 24px !important;
      inline-size: 100% !important;
      min-block-size: 24px !important;
      min-inline-size: 0 !important;
      writing-mode: horizontal-tb !important;
      width: 100% !important;
    }

    .metadata-slider-filter__input::-webkit-slider-runnable-track {
      background: transparent;
      height: 8px;
    }

    .metadata-slider-filter__input::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      background: #ffffff;
      border: 2px solid #0067b1;
      border-radius: 50%;
      cursor: grab;
      height: 18px;
      margin-top: -5px;
      pointer-events: auto;
      width: 18px;
    }

    .metadata-slider-filter__input::-moz-range-track {
      background: transparent;
      height: 8px;
    }

    .metadata-slider-filter__input::-moz-range-thumb {
      background: #ffffff;
      border: 2px solid #0067b1;
      border-radius: 50%;
      cursor: grab;
      height: 14px;
      pointer-events: auto;
      width: 14px;
    }

    .metadata-slider-filter__values {
      color: #475569;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .metadata-slider-filter__single-value {
      background: #f8fafc;
      border: 1px solid #bdc9d8;
      border-radius: 6px;
      box-sizing: border-box;
      color: #475569;
      cursor: help;
      font: inherit;
      font-weight: 700;
      height: 42px;
      padding: 9px 11px;
      width: 100%;
    }

  `;
  root.append(style);
}

function ensureSearchFormLayoutStyles(root) {
  if (root.querySelector('#coscine-search-form-layout-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'coscine-search-form-layout-styles';
  style.textContent = `
    .property-instance {
      gap: 6px;
    }

    /* Let an editor consume the unused part of its row instead of keeping
       only its intrinsic width. This is especially important for dates,
       whose complete value and calendar button need more room. */
    .property-instance > [part~='field'],
    .property-instance > .field {
      display: flex;
      flex: 1 1 0;
      margin-inline-end: 4px;
      max-inline-size: calc(100% - 4px);
      min-inline-size: 0;
    }

    .property-instance > .remove-button-wrapper,
    shacl-property > .add-button-wrapper,
    shacl-property > .collapsible > .add-button-wrapper {
      display: none !important;
    }

    .property-instance > [part~='field'] > .editor:not([type='checkbox']),
    .property-instance > .field > .editor:not([type='checkbox']),
    .property-instance > .editor:not([type='checkbox']) {
      flex: 1 1 0;
      inline-size: 100%;
      min-inline-size: 0;
    }

    .property-instance > [part~='field'] > .editor[type='date'],
    .property-instance > [part~='field'] > .editor[type='datetime-local'],
    .property-instance > .field > .editor[type='date'],
    .property-instance > .field > .editor[type='datetime-local'],
    .property-instance > .editor[type='date'],
    .property-instance > .editor[type='datetime-local'] {
      min-inline-size: min(12rem, 100%);
    }

    .metadata-single-option-value {
      align-self: stretch;
      background: #f1f5f9;
      border: 1px solid #bdc9d8;
      border-radius: 6px;
      color: #475569;
      flex: 1 1 0;
      font: inherit;
      inline-size: 100%;
      min-block-size: 36px;
      min-inline-size: 0;
      padding: 7px 10px;
    }

    rokit-select.editor[data-single-value-replaced='true'] {
      display: none !important;
    }
  `;
  root.append(style);
}

function replaceSingleValueDropdowns(formElement, observedMetadataValues) {
  const root = formElement.shadowRoot ?? formElement;
  const editors = Array.from(root.querySelectorAll('.property-instance[data-path] rokit-select.editor'));

  for (const editor of editors) {
    if (editor.dataset.singleValueReplaced === 'true') {
      continue;
    }

    const propertyInstance = editor.closest('.property-instance[data-path]');
    const path = propertyInstance?.dataset.path;
    const observedValues = observedMetadataValues.get(path);

    if (!path || observedValues?.size !== 1) {
      continue;
    }

    const onlyValue = observedValues.values().next().value;
    const normalizedOnlyValue = String(onlyValue).replace(/^<|>$/g, '');
    const options = Array.from(editor.querySelectorAll('li[data-value]'));
    const matchingOption = options.find((option) => {
      const optionValue = String(option.dataset.value ?? '').replace(/^<|>$/g, '');
      return optionValue === normalizedOnlyValue;
    });
    const optionLabel = Array.from(matchingOption?.childNodes ?? [])
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    const displayValue = isMetadataUri(optionLabel)
      ? compactMetadataUri(optionLabel)
      : optionLabel || compactMetadataUri(normalizedOnlyValue);
    const readOnlyValue = document.createElement('input');
    readOnlyValue.className = 'metadata-single-option-value';
    readOnlyValue.type = 'text';
    readOnlyValue.value = displayValue;
    readOnlyValue.readOnly = true;
    readOnlyValue.setAttribute('aria-label', displayValue);
    readOnlyValue.title = displayValue;

    editor.dataset.singleValueReplaced = 'true';
    editor.insertAdjacentElement('afterend', readOnlyValue);
  }
}

function isMetadataUri(value) {
  return /^(?:<)?(?:https?:\/\/|urn:)/i.test(String(value ?? '').trim());
}

function compactMetadataUri(value) {
  const normalizedValue = String(value ?? '').trim().replace(/^<|>$/g, '');
  const separatorIndex = Math.max(
    normalizedValue.lastIndexOf('#'),
    normalizedValue.lastIndexOf('/'),
    normalizedValue.lastIndexOf(':'),
  );
  const compactValue = separatorIndex >= 0 ? normalizedValue.slice(separatorIndex + 1) : normalizedValue;

  try {
    return decodeURIComponent(compactValue) || normalizedValue;
  } catch {
    return compactValue || normalizedValue;
  }
}

function attachLiveFieldListeners(formElement, updateSerialized) {
  const root = formElement.shadowRoot ?? formElement;
  const cleanupCallbacks = [];
  const editors = Array.from(root.querySelectorAll('.editor'));
  const events = ['input', 'keyup', 'change'];

  for (const editor of editors) {
    for (const eventName of events) {
      editor.addEventListener(eventName, updateSerialized);
      cleanupCallbacks.push(() => editor.removeEventListener(eventName, updateSerialized));
    }

    const innerFields = Array.from(editor.shadowRoot?.querySelectorAll('input, textarea, select') ?? []);

    for (const innerField of innerFields) {
      for (const eventName of events) {
        innerField.addEventListener(eventName, updateSerialized);
        cleanupCallbacks.push(() => innerField.removeEventListener(eventName, updateSerialized));
      }
    }
  }

  return () => {
    cleanupCallbacks.forEach((cleanup) => cleanup());
  };
}

function formInputToRangeValue(input) {
  const value = getEditorCurrentValue(input);

  if (!value) {
    return Number.NaN;
  }

  const inputType = getEditorInputType(input);
  if (inputType === 'date' || inputType === 'datetime-local') {
    return dateToEpoch(value);
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : Number.NaN;
}

function rangeValueToFormInput(value, inputType) {
  const date = new Date(Number(value) * 1000);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const isoValue = date.toISOString();
  return inputType === 'datetime-local' ? isoValue.slice(0, 19) : isoValue.slice(0, 10);
}

function getEditorCurrentValue(editor) {
  const innerField = editor.shadowRoot?.querySelector('input, textarea, select');
  const field = innerField ?? editor;

  if (field.type === 'checkbox') {
    return field.checked ? 'true' : '';
  }

  return String(field.value ?? editor.value ?? editor.dataset?.value ?? '').trim();
}

function getEditorInputType(editor) {
  const innerField = editor.shadowRoot?.querySelector('input, textarea, select');
  return innerField?.type || editor.type || editor.getAttribute?.('type') || 'text';
}

function getEditorDatatype(editor) {
  return editor.shaclDatatype?.value || editor.shaclDatatype?.id || editor.getAttribute?.('datatype') || '';
}

function getRangeInputType(editor) {
  const inputType = getEditorInputType(editor);
  const datatype = getEditorDatatype(editor);

  if (inputType === 'date' || datatype.endsWith('#date')) {
    return 'date';
  }

  if (inputType === 'datetime-local' || datatype.endsWith('#dateTime')) {
    return 'datetime-local';
  }

  return inputType;
}

function getNumericSliderStep(editor) {
  const step = editor.step || editor.getAttribute?.('step') || '';

  if (step && step !== 'any') {
    return step;
  }

  return isIntegerRangeEditor(editor) ? '1' : 'any';
}

function isRangeEditor(editor) {
  const inputType = getEditorInputType(editor);
  const datatype = getEditorDatatype(editor);

  return (
    ['number', 'date', 'datetime-local'].includes(inputType) ||
    ['#integer', '#float', '#double', '#decimal', '#date', '#dateTime'].some((suffix) =>
      datatype.endsWith(suffix),
    )
  );
}

function isNumericRangeEditor(editor) {
  const inputType = getEditorInputType(editor);
  const datatype = getEditorDatatype(editor);

  return (
    inputType === 'number' ||
    ['#integer', '#float', '#double', '#decimal'].some((suffix) => datatype.endsWith(suffix))
  );
}

function isIntegerRangeEditor(editor) {
  return getEditorDatatype(editor).endsWith('#integer') || editor.step === '1' || editor.getAttribute?.('step') === '1';
}

function buildNumericRangeStats(files) {
  const stats = new Map();

  for (const file of files ?? []) {
    const valueMap = extractRangeMetadataValueMap(file.metadata);

    for (const [path, values] of valueMap.entries()) {
      for (const value of values) {
        if (!Number.isFinite(value)) {
          continue;
        }

        const current = stats.get(path) ?? {
          count: 0,
          max: Number.NEGATIVE_INFINITY,
          min: Number.POSITIVE_INFINITY,
          path,
        };
        current.count += 1;
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        stats.set(path, current);
      }
    }
  }

  return stats;
}

function buildObservedMetadataValueMap(files) {
  const valuesByPath = new Map();
  const addValue = (path, value) => {
    const normalizedPath = String(path ?? '').trim();
    const normalizedValue = String(value ?? '').trim();

    if (!normalizedPath || !normalizedValue || normalizedPath.startsWith('@')) {
      return;
    }

    const values = valuesByPath.get(normalizedPath) ?? new Set();
    values.add(normalizedValue);
    valuesByPath.set(normalizedPath, values);
  };

  for (const file of files ?? []) {
    const json = extractJsonLdMetadata(file.metadata);

    if (json) {
      for (const node of Array.isArray(json) ? json : [json]) {
        if (!node || typeof node !== 'object') {
          continue;
        }

        for (const [path, rawValues] of Object.entries(node)) {
          for (const rawValue of Array.isArray(rawValues) ? rawValues : [rawValues]) {
            addValue(path, typeof rawValue === 'object' ? rawValue?.['@value'] ?? rawValue?.['@id'] : rawValue);
          }
        }
      }
      continue;
    }

    if (file.metadata && typeof file.metadata === 'object') {
      for (const [path, rawValues] of Object.entries(file.metadata)) {
        if (path.startsWith('@')) {
          continue;
        }

        for (const rawValue of Array.isArray(rawValues) ? rawValues : [rawValues]) {
          addValue(
            path,
            rawValue && typeof rawValue === 'object'
              ? rawValue.value ?? rawValue.label ?? rawValue['@value'] ?? rawValue['@id']
              : rawValue,
          );
        }
      }
      continue;
    }

    try {
      for (const item of parseRdfMetadataQuads(file.metadata)) {
        if (item.object.termType === 'Literal' || item.object.termType === 'NamedNode') {
          addValue(item.predicate.value, item.object.value);
        }
      }
    } catch {
      // Keep values from the remaining files when one metadata graph is malformed.
    }
  }

  return valuesByPath;
}

function buildNativeSearchFields(shapes, observedMetadataValues, numericRangeStats, preferredLanguage) {
  if (!shapes) {
    return [];
  }

  try {
    const quads = new Parser({ format: 'text/turtle' }).parse(shapes);
    const propertyShapes = quads
      .filter((item) => item.predicate.value === SH_PATH && item.object.termType === 'NamedNode')
      .map((item) => item.subject);
    const seenPaths = new Set();
    const fields = [];
    const metadataPaths = Array.from(observedMetadataValues.keys());

    for (const propertyShape of propertyShapes) {
      const path = getFirstQuadObjectValue(quads, propertyShape, SH_PATH);

      if (!path || seenPaths.has(path)) {
        continue;
      }

      seenPaths.add(path);
      const observedValues = findObservedMetadataValues(observedMetadataValues, path);

      const datatype = getFirstQuadObjectValue(quads, propertyShape, SH_DATATYPE);
      const label = getPreferredQuadLiteral(quads, propertyShape, SH_NAME, preferredLanguage)
        || findFieldLabelFromPath(path);
      const description = getPreferredQuadLiteral(quads, propertyShape, SH_DESCRIPTION, preferredLanguage);
      const isChoice = quads.some(
        (item) =>
          item.subject.equals(propertyShape) &&
          (item.predicate.value === SH_CLASS || item.predicate.value === SH_IN),
      );
      const isDate = datatype.endsWith('#date') || datatype.endsWith('#dateTime');
      const isNumeric = ['#integer', '#float', '#double', '#decimal'].some((suffix) =>
        datatype.endsWith(suffix),
      );
      const rangeStats = findNumericRangeStats(numericRangeStats, path);
      const id = `search-field-${fields.length}`;

      if ((isDate || isNumeric) && rangeStats?.count > 0) {
        if (rangeStats.min === rangeStats.max) {
          fields.push({
            description,
            displayValue: isDate
              ? rangeValueToFormInput(rangeStats.min, datatype.endsWith('#dateTime') ? 'datetime-local' : 'date')
              : String(rangeStats.min),
            id,
            kind: 'readonly',
            label,
            path,
          });
          continue;
        }

        const inputType = isDate
          ? datatype.endsWith('#dateTime') ? 'datetime-local' : 'date'
          : 'number';
        fields.push({
          description,
          id,
          inputType,
          kind: 'range',
          label,
          path,
          proposedMax: isDate ? rangeValueToFormInput(rangeStats.max, inputType) : String(rangeStats.max),
          proposedMin: isDate ? rangeValueToFormInput(rangeStats.min, inputType) : String(rangeStats.min),
        });
        continue;
      }

      if (isDate || isNumeric) {
        fields.push({
          description,
          displayValue: '-',
          id,
          kind: 'readonly',
          label,
          path,
        });
        continue;
      }

      if (!observedValues.length) {
        fields.push({
          description,
          displayValue: '-',
          id,
          kind: 'readonly',
          label,
          path,
        });
        continue;
      }

      if (observedValues.length === 1) {
        fields.push({
          description,
          displayValue: compactMetadataUri(observedValues[0]),
          id,
          kind: 'readonly',
          label,
          path,
        });
        continue;
      }

      fields.push({
        description,
        id,
        kind: observedValues.length && (isChoice || observedValues.length < MAX_SEARCH_SELECT_VALUES)
          ? 'select'
          : 'text',
        label,
        path,
        values: observedValues,
      });
    }

    return fields.sort((left, right) => {
      const leftOrder = findObservedMetadataPathOrder(metadataPaths, left.path);
      const rightOrder = findObservedMetadataPathOrder(metadataPaths, right.path);
      return leftOrder - rightOrder;
    });
  } catch (error) {
    return [];
  }
}

function findObservedMetadataPathOrder(metadataPaths, fieldPath) {
  const directIndex = metadataPaths.indexOf(fieldPath);

  if (directIndex >= 0) {
    return directIndex;
  }

  const normalizedFieldPath = normalizeRangePath(fieldPath);
  const matchingPaths = metadataPaths.filter(
    (metadataPath) => normalizeRangePath(metadataPath) === normalizedFieldPath,
  );

  return matchingPaths.length === 1 ? metadataPaths.indexOf(matchingPaths[0]) : Number.MAX_SAFE_INTEGER;
}

function findObservedMetadataValues(observedMetadataValues, fieldPath) {
  const directValues = observedMetadataValues.get(fieldPath);

  if (directValues?.size) {
    return Array.from(directValues).sort((left, right) => left.localeCompare(right));
  }

  const normalizedFieldPath = normalizeRangePath(fieldPath);
  const matches = Array.from(observedMetadataValues.entries()).filter(
    ([metadataPath, values]) => values.size > 0 && normalizeRangePath(metadataPath) === normalizedFieldPath,
  );

  return matches.length === 1
    ? Array.from(matches[0][1]).sort((left, right) => left.localeCompare(right))
    : [];
}

function findNumericRangeStats(stats, fieldPath) {
  const directMatch = stats.get(fieldPath);

  if (directMatch) {
    return directMatch;
  }

  const normalizedFieldPath = normalizeRangePath(fieldPath);
  const matches = Array.from(stats.entries()).filter(([metadataPath]) =>
    normalizeRangePath(metadataPath) === normalizedFieldPath,
  );

  return matches.length === 1 ? matches[0][1] : undefined;
}

function normalizeRangePath(path) {
  const value = String(path ?? '').trim().replace(/^<|>$/g, '');
  const separatorIndex = Math.max(value.lastIndexOf('#'), value.lastIndexOf('/'), value.lastIndexOf(':'));
  return (separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value).toLowerCase();
}

function formatSliderValue(value) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function getRangeLabels(language = 'en') {
  return language === 'de'
    ? {
        available: 'Verfuegbar',
        from: 'Von',
        onlyValueHint: 'Dies ist der einzige gefundene Wert.',
        selected: 'Ausgewaehlt',
        to: 'Bis',
      }
    : {
        available: 'Available',
        from: 'From',
        onlyValueHint: 'This is the only value found.',
        selected: 'Selected',
        to: 'To',
      };
}

function extractTextMetadataValueMap(metadata) {
  const json = extractJsonLdMetadata(metadata);
  const valueMap = new Map();

  if (!json) {
    for (const item of parseRdfMetadataQuads(metadata)) {
      if (item.object.termType !== 'Literal' && item.object.termType !== 'NamedNode') {
        continue;
      }

      const normalizedLiteral = normalizeTextFilterValue(item.object.value);

      if (normalizedLiteral !== '') {
        const currentValues = valueMap.get(item.predicate.value) ?? [];
        currentValues.push(normalizedLiteral);
        if (item.object.termType === 'NamedNode') {
          currentValues.push(normalizeTextFilterValue(findFieldLabelFromPath(item.object.value)));
        }
        valueMap.set(item.predicate.value, currentValues);
      }
    }

    return valueMap;
  }

  const nodes = Array.isArray(json) ? json : [json];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    for (const [predicate, rawValues] of Object.entries(node)) {
      if (predicate.startsWith('@')) {
        continue;
      }

      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      for (const rawValue of values) {
        const literal = typeof rawValue === 'object' ? rawValue?.['@value'] ?? rawValue?.['@id'] : rawValue;
        const normalizedLiteral = normalizeTextFilterValue(literal);

        if (normalizedLiteral !== '') {
          const currentValues = valueMap.get(predicate) ?? [];
          currentValues.push(normalizedLiteral);
          if (typeof rawValue === 'object' && rawValue?.['@id']) {
            currentValues.push(normalizeTextFilterValue(findFieldLabelFromPath(rawValue['@id'])));
          }
          valueMap.set(predicate, currentValues);
        }
      }
    }
  }

  return valueMap;
}

function buildFileMetadataRows(metadata, shapes, preferredLanguage = 'en', providedLabelsByPath = null) {
  const rows = new Map();
  const labelsByPath = providedLabelsByPath ?? collectShapeLabelsByPath(shapes, preferredLanguage);
  const technicalSearchFields = new Set([
    'absolutefilename', 'filename', 'graphname', 'homepage', 'ispublic',
    'structuretype', 'version', 'belongstoproject',
  ]);
  const findMetadataLabel = (path) => {
    if (labelsByPath.has(path)) {
      return labelsByPath.get(path);
    }

    const normalizedPath = normalizeRangePath(path);
    const matches = Array.from(labelsByPath.entries()).filter(
      ([shapePath]) => normalizeRangePath(shapePath) === normalizedPath,
    );
    return matches.length === 1 ? matches[0][1] : findFieldLabelFromPath(path);
  };
  const addValue = (path, value) => {
    const normalizedPath = String(path ?? '').trim();
    const normalizedValue = String(value ?? '').trim();

    if (!normalizedPath || !normalizedValue || normalizedPath === RDF_TYPE || normalizedPath === DCTERMS_CONFORMS_TO) {
      return;
    }

    const row = rows.get(normalizedPath) ?? {
      label: findMetadataLabel(normalizedPath),
      path: normalizedPath,
      values: [],
    };

    if (!row.values.includes(normalizedValue)) {
      row.values.push(normalizedValue);
    }

    rows.set(normalizedPath, row);
  };
  const json = extractJsonLdMetadata(metadata);

  if (json) {
    for (const node of Array.isArray(json) ? json : [json]) {
      if (!node || typeof node !== 'object') {
        continue;
      }

      for (const [path, rawValues] of Object.entries(node)) {
        if (path.startsWith('@')) {
          continue;
        }

        for (const rawValue of Array.isArray(rawValues) ? rawValues : [rawValues]) {
          addValue(path, typeof rawValue === 'object' ? rawValue?.['@value'] ?? rawValue?.['@id'] : rawValue);
        }
      }
    }
  } else if (metadata && typeof metadata === 'object') {
    for (const [path, rawValues] of Object.entries(metadata)) {
      if (technicalSearchFields.has(path.toLowerCase())) {
        continue;
      }

      for (const rawValue of Array.isArray(rawValues) ? rawValues : [rawValues]) {
        if (rawValue && typeof rawValue === 'object') {
          addValue(path, rawValue.value ?? rawValue.label ?? rawValue['@value'] ?? rawValue['@id']);
        } else {
          addValue(path, rawValue);
        }
      }
    }
  } else {
    try {
      for (const item of parseRdfMetadataQuads(metadata)) {
        if (item.object.termType === 'Literal') {
          addValue(item.predicate.value, item.object.value);
        } else if (item.object.termType === 'NamedNode') {
          addValue(item.predicate.value, findFieldLabelFromPath(item.object.value));
        }
      }
    } catch (error) {
      console.warn('[Coscine metadata] Could not parse metadata for the file details panel.', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Array.from(rows.values());
}

const CORE_METADATA_ALIASES = {
  title: [
    'title', 'maintitle', 'resourcetitle', 'datasettitle', 'objecttitle', 'worktitle',
    'alternativetitle', 'subtitle', 'shorttitle', 'headline', 'caption', 'preflabel',
    'preferredlabel', 'titel', 'haupttitel', 'name', 'resourcename', 'datasetname',
    'objectname', 'label',
  ],
  creator: [
    'creator', 'creators', 'creatorname', 'creatornames', 'hascreator', 'author',
    'authors', 'authorname', 'authornames', 'hasauthor', 'createdby', 'authoredby',
    'primaryauthor', 'principalinvestigator', 'principalinvestigators', 'investigator',
    'investigators', 'originator', 'maker', 'artist', 'photographer', 'contributor',
    'contributors', 'autor', 'autoren', 'ersteller', 'urheber',
  ],
  date: [
    'date', 'dates', 'datetime', 'datecreated', 'creationdate', 'created', 'createdat',
    'creationtime', 'creationyear', 'dateissued', 'issued', 'issuedat', 'datepublished',
    'publicationdate', 'publicationyear', 'published', 'publishedat', 'modified',
    'modifiedat', 'datemodified', 'modificationdate', 'lastmodified', 'updated',
    'updatedat', 'generatedattime', 'capturedate', 'acquisitiondate', 'recordingdate',
    'copyrightyear', 'timestamp', 'year', 'datum',
    'erstellungsdatum', 'aufnahmedatum', 'veroeffentlichungsdatum', 'anderungsdatum',
  ],
};

function buildCoreMetadataSummary(metadata, labelsByPath, selectedLanguage = 'en') {
  const rows = buildFileMetadataRows(metadata, '', selectedLanguage, labelsByPath);
  const matches = { title: null, creator: null, date: null };

  for (const row of rows) {
    for (const kind of Object.keys(matches)) {
      const score = coreMetadataMatchScore(row, kind);

      if (Number.isFinite(score) && (!matches[kind] || score < matches[kind].score)) {
        matches[kind] = { row, score };
      }
    }
  }

  const title = formatCoreMetadataValues(matches.title?.row.values)
    || (selectedLanguage === 'de' ? 'Metadatensatz ohne Titel' : 'Untitled metadata record');
  const creator = formatCoreMetadataValues(matches.creator?.row.values);
  const date = formatCoreMetadataValues(matches.date?.row.values);
  const labels = selectedLanguage === 'de'
    ? { creator: 'Urheber', date: 'Datum' }
    : { creator: 'Creator', date: 'Date' };

  return {
    title,
    detailItems: [
      creator ? { label: labels.creator, value: creator } : null,
      date ? { label: labels.date, value: date } : null,
    ].filter(Boolean),
  };
}

function coreMetadataMatchScore(row, kind) {
  const aliases = CORE_METADATA_ALIASES[kind];
  const tokens = [normalizeCoreMetadataName(row.path), normalizeCoreMetadataName(row.label)];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [tokenIndex, token] of tokens.entries()) {
    for (const [aliasIndex, alias] of aliases.entries()) {
      if (token === alias) {
        bestScore = Math.min(bestScore, aliasIndex + tokenIndex * 100);
      } else if (alias.length >= 5 && token.endsWith(alias)) {
        bestScore = Math.min(bestScore, aliasIndex + 50 + tokenIndex * 100);
      }
    }
  }

  return bestScore;
}

function normalizeCoreMetadataName(value) {
  return compactMetadataUri(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+$/, '');
}

function formatCoreMetadataValues(values) {
  const uniqueValues = Array.from(
    new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean)),
  );

  if (!uniqueValues.length) {
    return '';
  }

  const visibleValues = uniqueValues.slice(0, 2).join(', ');
  return uniqueValues.length > 2 ? `${visibleValues} +${uniqueValues.length - 2}` : visibleValues;
}

function collectShapeLabelsByPath(shapes, preferredLanguage = 'en') {
  const labelsByPath = new Map();

  if (!shapes || typeof shapes !== 'string') {
    return labelsByPath;
  }

  try {
    const quads = new Parser({ format: 'text/turtle' }).parse(shapes);
    const propertyShapes = new Set(
      quads
        .filter((item) => item.predicate.value === SH_PATH)
        .map((item) => item.subject),
    );

    for (const propertyShape of propertyShapes) {
      const path = getFirstQuadObjectValue(quads, propertyShape, SH_PATH);
      const label = getPreferredQuadLiteral(quads, propertyShape, SH_NAME, preferredLanguage);

      if (path && label && !labelsByPath.has(path)) {
        labelsByPath.set(path, label);
      }
    }
  } catch {
    // A missing label is not a metadata loading failure; the path-based fallback remains usable.
  }

  return labelsByPath;
}

function extractRangeMetadataValueMap(metadata) {
  const json = extractJsonLdMetadata(metadata);
  const valueMap = new Map();

  if (!json) {
    if (metadata && typeof metadata === 'object') {
      for (const [predicate, rawValues] of Object.entries(metadata)) {
        for (const rawValue of Array.isArray(rawValues) ? rawValues : [rawValues]) {
          const literal = rawValue && typeof rawValue === 'object'
            ? rawValue.value ?? rawValue['@value']
            : rawValue;
          const rangeValue = literalToRangeValue(literal, '');

          if (Number.isFinite(rangeValue)) {
            const currentValues = valueMap.get(predicate) ?? [];
            currentValues.push(rangeValue);
            valueMap.set(predicate, currentValues);
          }
        }
      }
      return valueMap;
    }

    return extractTurtleRangeMetadataValueMap(metadata);
  }

  const nodes = Array.isArray(json) ? json : [json];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    for (const [predicate, rawValues] of Object.entries(node)) {
      if (predicate.startsWith('@')) {
        continue;
      }

      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      for (const rawValue of values) {
        const literal = typeof rawValue === 'object' ? rawValue?.['@value'] : rawValue;
        const datatype = typeof rawValue === 'object' ? rawValue?.['@type'] : '';
        const rangeValue = literalToRangeValue(literal, datatype);

        if (Number.isFinite(rangeValue)) {
          const currentValues = valueMap.get(predicate) ?? [];
          currentValues.push(rangeValue);
          valueMap.set(predicate, currentValues);
        }
      }
    }
  }

  return valueMap;
}

function extractTurtleRangeMetadataValueMap(metadata) {
  const valueMap = new Map();

  try {
    for (const item of parseRdfMetadataQuads(metadata)) {
      if (item.object.termType !== 'Literal') {
        continue;
      }

      const rangeValue = literalToRangeValue(item.object.value, item.object.datatype?.value ?? '');

      if (Number.isFinite(rangeValue)) {
        const currentValues = valueMap.get(item.predicate.value) ?? [];
        currentValues.push(rangeValue);
        valueMap.set(item.predicate.value, currentValues);
      }
    }
  } catch {
    return new Map();
  }

  return valueMap;
}

function parseRdfMetadataQuads(metadata) {
  const rdf = extractRdfMetadataString(metadata);

  if (!rdf) {
    return [];
  }

  return new Parser({ format: isNQuadsMetadata(rdf) ? 'N-Quads' : 'text/turtle' }).parse(rdf);
}

function isNQuadsMetadata(rdf) {
  return /(?:^|\n)\s*(?:<[^>]+>|_:[^\s]+)\s+<[^>]+>\s+[\s\S]*?\s+(?:<[^>]+>|_:[^\s]+)\s+\.\s*(?:\r?\n|$)/.test(rdf);
}

function extractRdfMetadataString(metadata) {
  if (!metadata) {
    return '';
  }

  if (typeof metadata === 'string') {
    return looksLikeRdf(metadata) ? metadata : '';
  }

  if (typeof metadata === 'object') {
    for (const key of ['content', 'metadata', 'data', 'value', 'rdf', 'ttl', 'turtle']) {
      const value = metadata[key];

      if (typeof value === 'string' && looksLikeRdf(value)) {
        return value;
      }
    }
  }

  return '';
}

function extractJsonLdMetadata(metadata) {
  if (!metadata) {
    return null;
  }

  if (isJsonLdMetadata(metadata)) {
    return metadata;
  }

  if (typeof metadata === 'string' && /^\s*[\[{]/.test(metadata)) {
    try {
      const parsed = JSON.parse(metadata);
      return isJsonLdMetadata(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (typeof metadata === 'object') {
    for (const key of ['content', 'metadata', 'data', 'value']) {
      const extracted = extractJsonLdMetadata(metadata[key]);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

function literalToRangeValue(literal, datatype) {
  if (literal === undefined || literal === null || datatype?.includes('boolean')) {
    return Number.NaN;
  }

  const dateValue = dateToEpoch(literal);
  if (datatype?.includes('date') && Number.isFinite(dateValue)) {
    return dateValue;
  }

  const numericValue = Number(literal);
  if (Number.isFinite(numericValue) && String(literal).trim() !== '') {
    return numericValue;
  }

  if (Number.isFinite(dateValue) && /T|\d{4}-\d{2}-\d{2}/.test(String(literal))) {
    return dateValue;
  }

  return Number.NaN;
}

function dateToEpoch(value) {
  if (!value) {
    return Number.NaN;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.NaN : Math.round(date.getTime() / 1000);
}

function extractFilterTerms(rdf) {
  return Array.from(
    new Set(
      String(rdf ?? '')
        .match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)
        ?.map((match) => match.slice(1, -1).trim().toLowerCase()) ?? [],
    ),
  );
}

function searchFilePath(file) {
  if (!file) {
    return '';
  }

  return String(file.path ?? file.name ?? file.fileName ?? file.key ?? file.id ?? '');
}

function getSearchFileSize(file) {
  const value = Number(file?.fileSize ?? file?.size ?? file?.contentSize);
  return Number.isFinite(value) ? value : Number.NaN;
}

function getSearchFileType(file, path = searchFilePath(file)) {
  const declaredType = String(file?.fileType ?? file?.contentType ?? file?.mimeType ?? '').trim();

  if (declaredType) {
    return declaredType.split(';')[0];
  }

  const fileName = String(path).split('/').pop() || '';
  const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
  return extension ? extension.toUpperCase() : '';
}

function buildSearchClassInstanceRdf(files, shapes) {
  const allQuads = [];
  const classesByPath = new Map();

  try {
    const shapeQuads = new Parser({ format: 'text/turtle' }).parse(shapes ?? '');
    const pathsByShape = new Map();

    for (const item of shapeQuads) {
      if (item.predicate.value === SH_PATH && item.object.termType === 'NamedNode') {
        pathsByShape.set(item.subject.id, item.object);
      }
    }

    for (const item of shapeQuads) {
      if (item.predicate.value !== SH_CLASS || item.object.termType !== 'NamedNode') {
        continue;
      }

      const path = pathsByShape.get(item.subject.id);
      if (!path) {
        continue;
      }

      const classes = classesByPath.get(path.value) ?? [];
      classes.push(item.object);
      classesByPath.set(path.value, classes);
    }
  } catch {
    // The form can still use explicit rdf:type statements from file metadata.
  }

  for (const [fileIndex, file] of (files ?? []).entries()) {
    try {
      const blankNodes = new Map();
      const rebaseBlankNode = (term) => {
        if (term.termType !== 'BlankNode') {
          return term;
        }

        if (!blankNodes.has(term.value)) {
          blankNodes.set(term.value, DataFactory.blankNode(`search-${fileIndex}-${term.value}`));
        }

        return blankNodes.get(term.value);
      };

      for (const item of parseRdfMetadataQuads(file.metadata)) {
        allQuads.push(
          quad(
            rebaseBlankNode(item.subject),
            item.predicate,
            rebaseBlankNode(item.object),
            rebaseBlankNode(item.graph),
          ),
        );

        // Coscine metadata often references a controlled-vocabulary term but
        // does not repeat that term's rdf:type in every file graph. Add the
        // type required by the property's SHACL class constraint so the
        // widget can offer the observed term in its dropdown.
        if (item.object.termType === 'NamedNode') {
          for (const classTerm of classesByPath.get(item.predicate.value) ?? []) {
            allQuads.push(quad(item.object, namedNode(RDF_TYPE), classTerm));
          }
        }
      }
    } catch {
      // A malformed metadata graph should not prevent choices from the other
      // files in the resource from being available.
    }
  }

  return allQuads.length ? serializeQuadsSync(allQuads) : '';
}

function normalizeSearchMetadataForForm(metadata, file) {
  const stableSubject = stableFileSubject(file);

  if (!metadata) {
    return { subject: stableSubject, values: '' };
  }

  if (typeof metadata === 'string') {
    return normalizeStringMetadataForForm(metadata, stableSubject);
  }

  if (isJsonLdMetadata(metadata)) {
    return normalizeJsonLdMetadataForForm(metadata, stableSubject);
  }

  for (const key of ['content', 'metadata', 'data', 'value', 'rdf', 'ttl', 'turtle']) {
    if (typeof metadata[key] === 'string' && looksLikeRdf(metadata[key])) {
      return normalizeStringMetadataForForm(metadata[key], stableSubject);
    }

    if (isJsonLdMetadata(metadata[key])) {
      return normalizeJsonLdMetadataForForm(metadata[key], stableSubject);
    }
  }

  if (typeof metadata.content === 'object') {
    return normalizeSearchMetadataForForm(metadata.content, file);
  }

  return { subject: stableSubject, values: '' };
}

function normalizeStringMetadataForForm(metadata, stableSubject) {
  const trimmedMetadata = String(metadata ?? '').trim();

  if (!trimmedMetadata) {
    return { subject: stableSubject, values: '' };
  }

  if (/^\s*[\[{]/.test(trimmedMetadata)) {
    try {
      return normalizeJsonLdMetadataForForm(JSON.parse(trimmedMetadata), stableSubject);
    } catch {
      // Keep non-JSON RDF strings as-is.
    }
  }

  if (isNQuadsMetadata(trimmedMetadata)) {
    try {
      return normalizeRdfQuadsForForm(parseRdfMetadataQuads(trimmedMetadata), stableSubject);
    } catch {
      // The original metadata remains available for display and filtering even if a form cannot prefill it.
    }
  }

  try {
    const quads = parseRdfMetadataQuads(trimmedMetadata);

    if (quads.some((item) => item.subject.termType === 'BlankNode')) {
      return normalizeRdfQuadsForForm(quads, stableSubject);
    }
  } catch {
    // Keep the source RDF unchanged when it cannot be parsed here.
  }

  const explicitSubject = inferTurtleSubject(trimmedMetadata);
  return { subject: explicitSubject || stableSubject, values: trimmedMetadata };
}

function normalizeRdfQuadsForForm(quads, stableSubject) {
  const rootSubject = findRootMetadataSubject(quads);

  if (!rootSubject) {
    const values = serializeQuadsSync(quads.map((item) => quad(item.subject, item.predicate, item.object)));
    return { subject: stableSubject, values };
  }

  const formSubject = rootSubject.termType === 'BlankNode' ? namedNode(stableSubject) : rootSubject;
  const normalizedQuads = quads.map((item) =>
    quad(
      item.subject.equals(rootSubject) ? formSubject : item.subject,
      item.predicate,
      item.object.equals(rootSubject) ? formSubject : item.object,
    ),
  );

  return {
    subject: formSubject.value,
    values: serializeQuadsSync(normalizedQuads),
  };
}

function normalizeJsonLdMetadataForForm(metadata, stableSubject) {
  const nodes = Array.isArray(metadata) ? metadata : [metadata];
  const normalizedNodes = nodes.map((node, index) => {
    if (!node || typeof node !== 'object') {
      return node;
    }

    const currentId = node['@id'];
    const nextId =
      index === 0 && (!currentId || String(currentId).startsWith('_:')) ? stableSubject : currentId;

    return nextId ? { ...node, '@id': nextId } : node;
  });

  const subject =
    normalizedNodes.find((node) => node && typeof node === 'object' && typeof node['@id'] === 'string')?.[
      '@id'
    ] || stableSubject;

  return {
    subject,
    values: JSON.stringify(Array.isArray(metadata) ? normalizedNodes : normalizedNodes[0]),
  };
}

function inferTurtleSubject(turtle) {
  const turtleSubject = turtle.match(/(?:^|\n)\s*<([^>]+)>\s+(?:a|<|[a-zA-Z][\w-]*:|\[[\s\S]*?\])/);

  if (turtleSubject?.[1]) {
    return turtleSubject[1];
  }

  return undefined;
}

function stableFileSubject(file) {
  const path = searchFilePath(file);
  return `urn:coscine:file:${encodeURIComponent(path || 'selected')}`;
}

function looksLikeRdf(value) {
  return /@prefix|@base|<[^>]+>\s+(?:a|<|[a-zA-Z][\w-]*:)|\{\s*"@context"/.test(value);
}

function isJsonLdMetadata(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const nodes = Array.isArray(value) ? value : [value];
  return nodes.some((node) => node && typeof node === 'object' && ('@id' in node || '@type' in node || '@context' in node));
}

function TestEnvironmentView({ isEnabled, onDeleteResource, onDeleteUpload, onRefresh, resources, uploadedFiles }) {
  const text = useAppText();
  const createdResources = resources.filter((resource) => resource.isCustomResource || resource.shaclFileName);
  const groupedResources = groupResourcesByProject(createdResources);
  const [selectedViewResourceKey, setSelectedViewResourceKey] = useState('');
  const [selectedUploadKey, setSelectedUploadKey] = useState('');
  const selectedViewResource =
    createdResources.find((resource) => resourceKey(resource) === selectedViewResourceKey) ??
    createdResources[0] ??
    null;
  const selectedUpload =
    uploadedFiles.find((file) => file.storageKey === selectedUploadKey) ??
    uploadedFiles[0] ??
    null;

  useEffect(() => {
    if (!createdResources.length) {
      setSelectedViewResourceKey('');
      return;
    }

    if (!selectedViewResourceKey || !createdResources.some((resource) => resourceKey(resource) === selectedViewResourceKey)) {
      setSelectedViewResourceKey(resourceKey(createdResources[0]));
    }
  }, [createdResources, selectedViewResourceKey]);

  useEffect(() => {
    if (!uploadedFiles.length) {
      setSelectedUploadKey('');
      return;
    }

    if (!selectedUploadKey || !uploadedFiles.some((file) => file.storageKey === selectedUploadKey)) {
      setSelectedUploadKey(uploadedFiles[0].storageKey);
    }
  }, [selectedUploadKey, uploadedFiles]);

  if (!isEnabled) {
    return <div className="empty-state">Switch to the test environment to inspect virtual resources.</div>;
  }

  return (
    <section className="view-grid">
      <div className="view-panel">
        <div className="panel-title">
          <div>
            <h3>Created resources</h3>
            <p>Resources created in the emulator are stored locally in this browser.</p>
          </div>
          <button className="refresh-button" type="button" onClick={onRefresh}>
            {text.refresh}
          </button>
        </div>

        {groupedResources.length ? (
          groupedResources.map((project) => (
            <div className="project-group" key={project.id}>
              <div className="project-heading">
                <strong>{project.name}</strong>
                <span>{project.resources.length}</span>
              </div>
              {project.resources.map((resource) => (
                <div className="managed-row" key={resourceKey(resource)}>
                  <button
                    className={
                      selectedViewResource && resourceKey(resource) === resourceKey(selectedViewResource)
                        ? 'view-row selectable-row active'
                        : 'view-row selectable-row'
                    }
                    type="button"
                    onClick={() => setSelectedViewResourceKey(resourceKey(resource))}
                  >
                    <strong>{getResourceDisplayName(resource)}</strong>
                    <span>{getResourceTypeDisplayName(resource) || 'Resource'}</span>
                    <small>{resource.shaclFileName ? `SHACL file: ${resource.shaclFileName}` : 'Created resource'}</small>
                  </button>
                  <button
                    className="delete-row-button"
                    type="button"
                    onClick={() => onDeleteResource(resource)}
                  >
                    {text.delete}
                  </button>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="empty-state">No resources have been created yet.</div>
        )}

        {selectedViewResource ? (
          <SelectedResourceDetails resource={selectedViewResource} />
        ) : null}
      </div>

      <div className="view-panel">
        <div className="panel-title">
          <div>
            <h3>Uploaded files</h3>
            <p>Files uploaded through the emulator are listed here with their metadata snapshot.</p>
          </div>
          <button className="refresh-button" type="button" onClick={onRefresh}>
            {text.refresh}
          </button>
        </div>

        {uploadedFiles.length ? (
          <>
            <div className="selectable-list">
              {uploadedFiles.map((file) => (
                <div className="managed-row" key={file.storageKey}>
                  <button
                    className={file.storageKey === selectedUpload?.storageKey ? 'upload-record active' : 'upload-record'}
                    type="button"
                    onClick={() => setSelectedUploadKey(file.storageKey)}
                  >
                    <div className="upload-record-head">
                      <strong>{file.fileName}</strong>
                      <span>{formatBytes(file.fileSize)}</span>
                    </div>
                    <small>{getResourceDisplayName(file)}</small>
                  </button>
                  <button
                    className="delete-row-button"
                    type="button"
                    onClick={() => onDeleteUpload(file)}
                  >
                    {text.delete}
                  </button>
                </div>
              ))}
            </div>
            <SelectedUploadDetails file={selectedUpload} />
          </>
        ) : (
          <div className="empty-state">No uploaded files yet.</div>
        )}
      </div>
    </section>
  );
}

function SelectedResourceDetails({ resource }) {
  return (
    <div className="selected-details">
      <h3>Selected resource</h3>
      <dl className="upload-facts upload-facts-compact">
        <div>
          <dt>Name</dt>
          <dd>{getResourceDisplayName(resource)}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{getProjectDisplayName(resource)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{getResourceTypeDisplayName(resource) || 'Resource'}</dd>
        </div>
        <div>
          <dt>SHACL file</dt>
          <dd>{resource.shaclFileName || 'n/a'}</dd>
        </div>
      </dl>
    </div>
  );
}

function SelectedUploadDetails({ file }) {
  if (!file) {
    return null;
  }

  return (
    <div className="selected-details">
      <h3>Selected file</h3>
      <dl className="upload-facts upload-facts-compact">
        <div>
          <dt>Resource</dt>
          <dd>{getResourceDisplayName(file)}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{getProjectDisplayName(file)}</dd>
        </div>
        <div>
          <dt>Uploaded</dt>
          <dd>{file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : 'n/a'}</dd>
        </div>
        <div>
          <dt>SHACL file</dt>
          <dd>{file.shaclFileName || 'n/a'}</dd>
        </div>
      </dl>
      <details open>
        <summary>Serialized metadata</summary>
        <pre>{file.metadataContent}</pre>
      </details>
    </div>
  );
}

function UploadWorkspace({
  formMemoryFields,
  isLoadingProfile,
  isUploading,
  metadataFormRef,
  metadataValid,
  metadataValidationSummary,
  onFilesChange,
  onMetadataChange,
  onMetadataValidChange,
  onMetadataValidationSummaryChange,
  onRememberedFieldPathsChange,
  onRememberedFieldsChange,
  onTargetPathChange,
  onUpload,
  profile,
  rememberedFieldPaths,
  resource,
  selectedLanguage,
  serviceLabel,
  selectedFiles,
  targetPath,
  uploadButtonLabel,
}) {
  const text = useAppText();
  const canUpload = Boolean(profile?.shapes && selectedFiles.length);
  const selectedFilesLabel = formatSelectedFilesLabel(selectedFiles);
  const formMemoryContextKey = getFormMemoryContextKey(profile, resource);
  const rememberedMetadataContent = useMemo(
    () => buildRememberedMetadataContent(formMemoryContextKey, profile),
    [formMemoryContextKey, profile, rememberedFieldPaths],
  );
  const rememberedValuesSubject = useMemo(
    () => getRememberedValuesSubject(formMemoryContextKey),
    [formMemoryContextKey],
  );
  const rememberedFieldPathsRef = useRef(rememberedFieldPaths);
  const memoryEnabledRef = useRef(Boolean(rememberedFieldPaths.length));
  const [memoryResetVersion, setMemoryResetVersion] = useState(0);

  useEffect(() => {
    onRememberedFieldPathsChange(readRememberedFieldSelection(formMemoryContextKey, profile));
    onRememberedFieldsChange([]);
  }, [formMemoryContextKey, onRememberedFieldPathsChange, onRememberedFieldsChange, profile]);

  useEffect(() => {
    rememberedFieldPathsRef.current = rememberedFieldPaths;
    memoryEnabledRef.current = Boolean(rememberedFieldPaths.length);
  }, [rememberedFieldPaths]);

  const persistRememberedFieldValues = useCallback((metadataContentToSave, fields, fieldPaths) => {
    saveRememberedFormFields({
      contextKey: formMemoryContextKey,
      fieldPaths: fieldPaths ?? rememberedFieldPathsRef.current,
      fields,
      metadataContent: metadataContentToSave,
      profile,
    });
  }, [formMemoryContextKey, profile]);

  const handleFieldsDetected = useCallback((fields) => {
    onRememberedFieldsChange(fields);

    if (!memoryEnabledRef.current) {
      return;
    }

    const allFieldPaths = fields.map((field) => field.path);
    writeRememberedFieldSelection(formMemoryContextKey, allFieldPaths);
    rememberedFieldPathsRef.current = allFieldPaths;
    onRememberedFieldPathsChange(allFieldPaths);
  }, [formMemoryContextKey, onRememberedFieldPathsChange, onRememberedFieldsChange]);

  const setBrowserMemoryEnabled = useCallback((enabled) => {
    if (!enabled) {
      clearRememberedFormFields(formMemoryContextKey, profile);
      memoryEnabledRef.current = false;
      rememberedFieldPathsRef.current = [];
      onRememberedFieldPathsChange([]);
      setMemoryResetVersion((version) => version + 1);
      return;
    }

    const allFieldPaths = formMemoryFields.map((field) => field.path);
    memoryEnabledRef.current = true;
    rememberedFieldPathsRef.current = allFieldPaths;
    writeRememberedFieldSelection(formMemoryContextKey, allFieldPaths);

    const serializedMetadata = metadataFormRef.current?.serialize?.() ?? '';
    persistRememberedFieldValues(serializedMetadata, formMemoryFields, allFieldPaths);
    onRememberedFieldPathsChange(allFieldPaths);
  }, [
    formMemoryContextKey,
    formMemoryFields,
    metadataFormRef,
    onRememberedFieldPathsChange,
    persistRememberedFieldValues,
    profile,
  ]);

  const isBrowserMemoryEnabled = rememberedFieldPaths.length > 0;

  return (
    <>
      <div className="detail-header">
        <div>
          <p className="eyebrow">{getProjectDisplayName(resource)}</p>
          <h2>{getResourceDisplayName(resource)}</h2>
        </div>
        <span>{getResourceTypeDisplayName(resource) || 'Resource'}</span>
      </div>

      <div className="workspace-split">
        <section className="form-panel">
          <div className="panel-title">
            <div>
              <h3>{text.requiredMetadata}</h3>
            </div>
            <span>{metadataValid ? text.ready : text.pending}</span>
          </div>
          {metadataValidationSummary ? (
            <div className="validation-summary" role="alert">
              {metadataValidationSummary}
            </div>
          ) : null}

          {isLoadingProfile ? <p className="muted">{text.loadingShaclForm}</p> : null}
          {!isLoadingProfile && profile?.shapes ? (
            <>
              <ShaclFormHost
                formKey={`${resource.projectId}:${resource.resourceId}:${profile.baseUri}:${rememberedMetadataContent}:${memoryResetVersion}`}
                formElementRef={metadataFormRef}
                rememberedMetadataContent={rememberedMetadataContent}
                rememberedFieldPaths={rememberedFieldPaths}
                selectedLanguage={selectedLanguage}
                rememberedValuesSubject={rememberedValuesSubject}
                shapes={profile.shapes}
                onFieldsDetected={handleFieldsDetected}
                onMetadataChange={onMetadataChange}
                onMetadataValidChange={onMetadataValidChange}
                onMetadataValidationSummaryChange={onMetadataValidationSummaryChange}
                onRememberedValuesChange={persistRememberedFieldValues}
              />
              <div className="memory-panel">
                <div>
                  <h3>{text.browserMemory}</h3>
                  <p>{text.useMemoryCheckbox}</p>
                </div>
                <input
                  aria-label={text.browserMemory}
                  checked={isBrowserMemoryEnabled}
                  disabled={!formMemoryFields.length}
                  type="checkbox"
                  onChange={(event) => setBrowserMemoryEnabled(event.target.checked)}
                />
              </div>
            </>
          ) : null}
        </section>

        <section className="upload-panel">
          <div className="panel-title">
            <div>
              <h3>{text.selectedFile}</h3>
              <p>The chosen files are uploaded through {serviceLabel}.</p>
            </div>
          </div>

          <label className="field-label">
            {text.file}
            <input
              type="file"
              multiple
              onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
            />
          </label>

          <label className="field-label">
            {text.coscinePath}
            <input
              value={targetPath}
              placeholder={selectedFiles.length > 1 ? 'folder/' : 'folder/name.ext'}
              onChange={(event) => onTargetPathChange(event.target.value)}
            />
          </label>

          <dl className="upload-facts">
            <div>
              <dt>{text.selectedFile}</dt>
              <dd>{selectedFilesLabel}</dd>
            </div>
          </dl>
          {selectedFiles.length > 1 ? (
            <ul className="selected-files-list">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <span>{file.name}</span>
                  <span>{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <button className="primary-action" type="button" disabled={!canUpload || isUploading} onClick={onUpload}>
            {isUploading ? text.uploading : uploadButtonLabel}
          </button>
        </section>
      </div>
    </>
  );
}

function ShaclFormHost({
  formElementRef,
  formKey,
  onFieldsDetected,
  onMetadataChange,
  onMetadataValidChange,
  onMetadataValidationSummaryChange,
  onRememberedValuesChange,
  rememberedMetadataContent,
  rememberedFieldPaths,
  rememberedValuesSubject,
  selectedLanguage,
  shapes,
}) {
  const hostRef = useRef(null);
  const fieldsRef = useRef([]);
  const rememberedFieldPathsRef = useRef(rememberedFieldPaths);
  const sanitizedShapes = useMemo(
    () => sanitizeShapesForForm(removeUploadTechnicalProperties(shapes), true),
    [shapes],
  );
  const rootShapeSubject = useMemo(() => findRootShapeSubject(sanitizedShapes), [sanitizedShapes]);
  const targetClassUrls = useMemo(() => collectShapeTargetClasses(sanitizedShapes), [sanitizedShapes]);
  const descriptionsByPath = useMemo(
    () => collectShapeDescriptionsByPath(sanitizedShapes, selectedLanguage),
    [sanitizedShapes, selectedLanguage],
  );

  useEffect(() => {
    rememberedFieldPathsRef.current = rememberedFieldPaths;
  }, [rememberedFieldPaths]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || !sanitizedShapes) {
      onMetadataChange('');
      onMetadataValidChange(false);
      onMetadataValidationSummaryChange('');
      formElementRef.current = null;
      return undefined;
    }

    host.replaceChildren();

    const formElement = document.createElement('shacl-form');
    formElement.setRdfUrlResolver?.(fetchExternalMetadataRdf);
    formElement.setClassInstanceProvider?.((classes) => {
      const classUrls = typeof classes === 'string' ? [classes] : Array.from(classes ?? []);
      return fetchExternalClassInstances(
        classUrls.filter((classUrl) => !targetClassUrls.has(classUrl)),
      );
    });
    const validateMetadataForSubmission = formElement.validate.bind(formElement);
    formElement.validate = (ignoreEmptyValues = false) => {
      if (ignoreEmptyValues) {
        return Promise.resolve({ conforms: true, results: [] });
      }

      return validateMetadataForSubmission(false);
    };
    formElement.setAttribute('data-shapes', sanitizedShapes);
    formElement.setAttribute('data-language', selectedLanguage);
    if (rootShapeSubject) {
      formElement.setAttribute('data-shape-subject', rootShapeSubject);
    }
    if (rememberedMetadataContent) {
      formElement.setAttribute('data-values', rememberedMetadataContent);
      formElement.setAttribute('data-values-subject', rememberedValuesSubject);
    }
    formElement.setAttribute('data-show-root-shape-label', '');
    formElementRef.current = formElement;
    let validityRequestId = 0;
    let validationIndicatorFrame = 0;

    const saveCurrentRememberedValues = (fieldPaths = rememberedFieldPathsRef.current) => {
      if (!fieldPaths.length || typeof formElement.serialize !== 'function') {
        return;
      }

      const serializedMetadata = formElement.serialize();

      if (String(serializedMetadata ?? '').trim()) {
        onRememberedValuesChange(serializedMetadata, fieldsRef.current, fieldPaths);
      }
    };

    const refreshValidity = async () => {
      const requestId = (validityRequestId += 1);

      if (typeof formElement.validate !== 'function') {
        const serializedMetadata = typeof formElement.serialize === 'function' ? formElement.serialize() : '';
        onMetadataValidChange(Boolean(String(serializedMetadata ?? '').trim()));
        onMetadataValidationSummaryChange('');
        syncValidationIndicators(formElement, null);
        return;
      }

      try {
        const validationReport = await formElement.validate(false);

        if (requestId !== validityRequestId) {
          return;
        }

        const serializedMetadata = typeof formElement.serialize === 'function' ? formElement.serialize() : '';
        const isValid = Boolean(validationReport?.conforms && String(serializedMetadata ?? '').trim());
        onMetadataValidChange(isValid);
        onMetadataChange(isValid ? serializedMetadata : '');
        onMetadataValidationSummaryChange(isValid ? '' : formatValidationReport(formElement, validationReport));
        syncValidationIndicators(formElement, validationReport);
      } catch {
        if (requestId === validityRequestId) {
          onMetadataValidChange(false);
          onMetadataChange('');
          onMetadataValidationSummaryChange('Could not validate the metadata form.');
          syncValidationIndicators(formElement, null);
        }
      }
    };

    const detectFields = () => {
      const fields = detectMemoryFields(formElement);
      fieldsRef.current = fields;
      onFieldsDetected(fields);
      attachFieldDescriptionTooltips(formElement, descriptionsByPath);
      saveCurrentRememberedValues();
      onMetadataValidChange(false);
      onMetadataValidationSummaryChange('');
    };

    const scheduleValidationIndicatorSync = () => {
      window.cancelAnimationFrame(validationIndicatorFrame);
      validationIndicatorFrame = window.requestAnimationFrame(() => {
        syncValidationIndicators(formElement);
      });
    };

    const handleChange = () => {
      saveCurrentRememberedValues();
      onMetadataValidChange(false);
      onMetadataChange('');
      onMetadataValidationSummaryChange('');
      scheduleValidationIndicatorSync();
    };

    const handleInput = () => {
      saveCurrentRememberedValues();
      onMetadataValidChange(false);
      onMetadataChange('');
      onMetadataValidationSummaryChange('');
      scheduleValidationIndicatorSync();
    };

    const handleSubmit = (event) => {
      event.preventDefault();
      refreshValidity();
      scheduleValidationIndicatorSync();
    };

    formElement.addEventListener('change', handleChange);
    formElement.addEventListener('input', handleInput);
    formElement.addEventListener('ready', detectFields);
    formElement.addEventListener('submit', handleSubmit);
    host.appendChild(formElement);
    hideShaclFormSubmitButton(formElement);
    const descriptionObserver = observeFieldDescriptionTooltips(formElement, descriptionsByPath);
    const validationObserver = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === 'attributes' &&
            mutation.attributeName === 'class' &&
            mutation.target?.classList?.contains('property-instance'),
        )
      ) {
        scheduleValidationIndicatorSync();
      }
    });
    validationObserver.observe(getFormRoot(formElement), {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    window.setTimeout(detectFields, 0);
    window.setTimeout(detectFields, 250);

    return () => {
      window.cancelAnimationFrame(validationIndicatorFrame);
      descriptionObserver.disconnect();
      validationObserver.disconnect();
      formElement.removeEventListener('change', handleChange);
      formElement.removeEventListener('input', handleInput);
      formElement.removeEventListener('ready', detectFields);
      formElement.removeEventListener('submit', handleSubmit);
      if (formElementRef.current === formElement) {
        formElementRef.current = null;
      }
      host.replaceChildren();
    };
  }, [
    formElementRef,
    formKey,
    onFieldsDetected,
    onMetadataChange,
    onMetadataValidChange,
    onMetadataValidationSummaryChange,
    onRememberedValuesChange,
    rememberedMetadataContent,
    rememberedValuesSubject,
    descriptionsByPath,
    rootShapeSubject,
    selectedLanguage,
    sanitizedShapes,
    targetClassUrls,
  ]);

  return <div className="shacl-form-host" ref={hostRef} />;
}

function removeUploadTechnicalProperties(shapes) {
  if (!shapes || typeof shapes !== 'string') {
    return '';
  }

  const hiddenLabels = new Set(['identifier scheme', 'scheme uri']);

  try {
    const quads = new Parser({ format: 'text/turtle' }).parse(shapes);
    const hiddenPropertyShapes = new Set(
      quads
        .filter(
          (item) =>
            [SH_NAME, RDFS_LABEL].includes(item.predicate.value) &&
            item.object.termType === 'Literal',
        )
        .filter((item) => hiddenLabels.has(item.object.value.trim().toLowerCase()))
        .map((item) => item.subject.id),
    );
    const filteredQuads = quads.filter(
      (item) =>
        item.predicate.value !== SH_PROPERTY ||
        !hiddenPropertyShapes.has(item.object.id),
    );

    if (filteredQuads.length === quads.length) {
      return shapes;
    }

    const writer = new Writer({ format: 'text/turtle' });
    writer.addQuads(filteredQuads);
    let serialized = '';
    writer.end((error, output) => {
      if (error) {
        throw error;
      }
      serialized = output;
    });
    return serialized || shapes;
  } catch {
    return shapes;
  }
}

function sanitizeShapesForForm(shapes, preserveImports = false) {
  if (!shapes || typeof shapes !== 'string') {
    return '';
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(shapes);
    const filteredQuads = quads
      .filter((item) => preserveImports || item.predicate.value !== OWL_IMPORTS)
      .map((item) => normalizeShapeQuad(item));

    if (
      filteredQuads.length === quads.length &&
      filteredQuads.every((item, index) => item.equals(quads[index]))
    ) {
      return shapes;
    }

    const writer = new Writer({ format: 'text/turtle' });
    writer.addQuads(filteredQuads);

    let serialized = '';
    writer.end((error, output) => {
      if (error) {
        throw error;
      }

      serialized = output;
    });

    return serialized || shapes;
  } catch {
    return shapes;
  }
}

function normalizeShapeQuad(item) {
  if (
    item.predicate.value === 'http://www.w3.org/ns/shacl#pattern' &&
    item.object.termType === 'Literal' &&
    (item.object.value === '^[A-Za-z0-9]+([-_][A-Za-z0-9]+)*$' ||
      item.object.value === '^[A-Za-z0-9]+([_-][A-Za-z0-9]+)*$')
  ) {
    return quad(
      item.subject,
      item.predicate,
      literal('^[A-Za-z0-9]+([_\\-][A-Za-z0-9]+)*$', item.object.datatype),
      item.graph,
    );
  }

  return item;
}

function findRootShapeSubject(shapes) {
  if (!shapes || typeof shapes !== 'string') {
    return '';
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(shapes);
    const targetClassShape = quads.find(
      (item) => item.predicate.value === SH_TARGET_CLASS && item.subject.termType === 'NamedNode',
    )?.subject;

    if (targetClassShape) {
      return targetClassShape.value;
    }

    return quads.find(
      (item) =>
        item.predicate.value === RDF_TYPE &&
        item.object.termType === 'NamedNode' &&
        item.object.value === SH_NODE_SHAPE &&
        item.subject.termType === 'NamedNode',
    )?.subject.value || '';
  } catch {
    return '';
  }
}

function collectShapeTargetClasses(shapes) {
  if (!shapes || typeof shapes !== 'string') {
    return new Set();
  }

  try {
    return new Set(
      new Parser({ format: 'text/turtle' })
        .parse(shapes)
        .filter(
          (item) =>
            item.predicate.value === SH_TARGET_CLASS && item.object.termType === 'NamedNode',
        )
        .map((item) => item.object.value),
    );
  } catch {
    return new Set();
  }
}

function collectShapeDescriptionsByPath(shapes, preferredLanguage = 'en') {
  const descriptionsByPath = new Map();

  if (!shapes || typeof shapes !== 'string') {
    return descriptionsByPath;
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(shapes);
    const propertyShapes = new Set(
      quads
        .filter((item) => item.predicate.value === SH_PATH)
        .map((item) => item.subject),
    );

    for (const propertyShape of propertyShapes) {
      const path = getFirstQuadObjectValue(quads, propertyShape, SH_PATH);
      const description = getPreferredQuadLiteral(quads, propertyShape, SH_DESCRIPTION, preferredLanguage);

      if (path && description && !descriptionsByPath.has(path)) {
        descriptionsByPath.set(path, description);
      }
    }
  } catch {
  }

  return descriptionsByPath;
}

function attachFieldDescriptionTooltips(formElement, descriptionsByPath) {
  if (!formElement || !descriptionsByPath?.size) {
    return;
  }

  const root = getFormRoot(formElement);

  for (const propertyInstance of root.querySelectorAll('.property-instance[data-path], [data-path]')) {
    const path = propertyInstance.dataset.path;
    const description = descriptionsByPath.get(path);

    if (!path || !description) {
      continue;
    }

    const field = getDirectPropertyField(propertyInstance);
    const directLabel = propertyInstance.querySelector(':scope > label');
    const label = directLabel ?? field?.querySelector?.(':scope > label') ?? propertyInstance.querySelector('label');
    const editor = getDirectPropertyEditor(propertyInstance, field);
    const target = label ?? editor ?? propertyInstance;

    if (!target) {
      continue;
    }

    target.title = description;
    target.dataset.shaclDescriptionTooltip = 'true';

    if (!target.getAttribute('aria-description')) {
      target.setAttribute('aria-description', description);
    }

    if (editor && !editor.getAttribute('aria-description')) {
      editor.setAttribute('aria-description', description);
    }
  }
}

function observeFieldDescriptionTooltips(formElement, descriptionsByPath) {
  const root = getFormRoot(formElement);
  let frame = 0;
  const scheduleSync = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      attachFieldDescriptionTooltips(formElement, descriptionsByPath);
    });
  };
  const observer = new MutationObserver(scheduleSync);

  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  return {
    disconnect() {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}

function detectMemoryFields(formElement) {
  const root = getFormRoot(formElement);
  const fieldsByPath = new Map();

  for (const editor of root.querySelectorAll('.editor, input, select, textarea')) {
    if (editor.type === 'file' || editor.dataset.memoryControl === 'true') {
      continue;
    }

    const element = editor.closest('[data-path]');
    const path = element?.dataset.path;

    if (!path || fieldsByPath.has(path)) {
      continue;
    }

    fieldsByPath.set(path, {
      label: findFieldLabel(element, path),
      path,
    });
  }

  return Array.from(fieldsByPath.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function getFormRoot(formElement) {
  return formElement.shadowRoot ?? formElement;
}

function findFieldLabel(element, fallbackPath) {
  const label = element.querySelector('label');
  const labelClone = label?.cloneNode(true);
  labelClone?.querySelectorAll?.('.validation-ok').forEach((node) => node.remove());
  const labelText = labelClone?.textContent?.trim();

  if (labelText) {
    return labelText.replace(/\s+/g, ' ');
  }

  return fallbackPath.split(/[\/#]/).filter(Boolean).at(-1) || fallbackPath;
}

function formatValidationReport(formElement, validationReport) {
  const results = collectValidationResults(validationReport);
  const messages = results
    .map((result) => formatValidationResult(formElement, result))
    .filter(Boolean);
  const domMessages = collectFormValidationMessages(formElement);
  const uniqueMessages = Array.from(
    new Set(
      [...messages, ...domMessages]
        .map((message) => normalizeValidationMessage(message, { formElement }))
        .filter(Boolean),
    ),
  );

  if (!uniqueMessages.length) {
    return validationReport?.conforms === false
      ? 'Complete the highlighted metadata fields before uploading.'
      : '';
  }

  const visibleMessages = uniqueMessages.slice(0, 5);
  const remainingCount = uniqueMessages.length - visibleMessages.length;
  const suffix = remainingCount > 0 ? ` ${remainingCount} more issue${remainingCount === 1 ? '' : 's'} remain.` : '';

  return `${visibleMessages.join(' ')}${suffix}`;
}

function formatValidationResult(formElement, result) {
  if (!result || typeof result !== 'object') {
    return '';
  }

  const path = getValidationResultPath(result);
  const label = findValidationFieldLabel(formElement, path);
  const rawMessage = describeConstraint(result, { formElement, label, path }) || getPreferredLiteralValue(result.message) || 'Invalid value.';
  const message = normalizeValidationMessage(rawMessage, { formElement, label, path });
  const details = getValidationResultDetails(result);
  const fieldPrefix = label ? `${label}: ` : '';

  return message.startsWith(label) || message.includes(' is incomplete.')
    ? `${message}${details}`.trim()
    : `${fieldPrefix}${message}${details}`.trim();
}

function getValidationResultPath(result) {
  const directPath = getTermValue(result.path || result.resultPath);
  if (directPath) {
    return directPath;
  }

  const pathStep = Array.isArray(result.path) ? result.path[0] : null;
  const predicate = Array.isArray(pathStep?.predicates) ? pathStep.predicates[0] : null;

  return getTermValue(predicate);
}

function getTermValue(term) {
  if (!term) {
    return '';
  }

  if (Array.isArray(term)) {
    return getTermValue(term[0]);
  }

  return term.id || term.value || term.term?.id || term.term?.value || '';
}

function findValidationFieldLabel(formElement, path) {
  if (!path) {
    return '';
  }

  const root = getFormRoot(formElement);
  const element = root.querySelector(`[data-path="${CSS.escape(path)}"]`);

  if (element) {
    return findFieldLabel(element, path);
  }

  return findFieldLabelFromPath(path);
}

function getPreferredLiteralValue(literals) {
  const values = Array.isArray(literals) ? literals : [];
  const english = values.find((item) => item?.language === 'en');
  const untagged = values.find((item) => !item?.language);
  const selected = english || untagged || values[0];

  return selected?.value || '';
}

function describeConstraint(result, { formElement = null, label = '', path = '' } = {}) {
  const constraint = result.constraintComponent?.value || result.constraintComponent?.id || '';

  if (constraint === SH_MIN_LENGTH_CONSTRAINT && result.args?.minLength) {
    return `Minimum length is ${result.args.minLength} characters.`;
  }

  if (constraint === SH_MIN_COUNT_CONSTRAINT && result.args?.minCount) {
    return `At least ${result.args.minCount} value${Number(result.args.minCount) === 1 ? '' : 's'} required.`;
  }

  if (constraint === SH_QUALIFIED_MIN_COUNT_CONSTRAINT) {
    return describeQualifiedSectionConstraint(label, path, formElement);
  }

  return '';
}

function describeQualifiedSectionConstraint(label, path, formElement = null) {
  const sectionName = label || findFieldLabelFromPath(path) || 'This section';
  return describeShapeRestrictionsForPath(formElement, path) ||
    `${sectionName} is incomplete. Check the highlighted required fields in this section.`;
}

function describeShapeRestrictionsForPath(formElement, path) {
  if (!formElement?.dataset?.shapes || !path) {
    return '';
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(formElement.dataset.shapes);
    const rootProperty = quads.find((item) => item.predicate.value === SH_PATH && item.object.value === path)?.subject;
    const shape = rootProperty
      ? quads.find((item) => item.subject.equals(rootProperty) && item.predicate.value === SH_QUALIFIED_VALUE_SHAPE)?.object
      : null;

    if (!shape) {
      return '';
    }

    return describeShapeRestrictions(formElement, quads, shape, findValidationFieldLabel(formElement, path), path);
  } catch {
    return '';
  }
}

function describeShapeRestrictionsFromMessage(formElement, message, fallbackLabel = '') {
  const shapeIri = extractShapeIriFromMessage(message);

  if (!shapeIri || !formElement?.dataset?.shapes) {
    return '';
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(formElement.dataset.shapes);
    const shape = resolveShapeTerm(quads, namedNode(shapeIri));
    return describeShapeRestrictions(formElement, quads, shape, fallbackLabel || findFieldLabelFromPath(shapeIri));
  } catch {
    return '';
  }
}

function describeShapeRestrictions(formElement, quads, shape, fallbackLabel = '', sectionPath = '') {
  const resolvedShape = resolveShapeTerm(quads, shape);
  const shapeLabel = findShapeTitle(quads, resolvedShape) || fallbackLabel || findFieldLabelFromPath(resolvedShape.value);
  const currentIssues = describeCurrentShapeIssues(formElement, quads, resolvedShape, sectionPath);

  if (currentIssues) {
    return `${shapeLabel} is incomplete. ${currentIssues.join('. ')}.`;
  }

  const restrictions = describeRequiredShapeProperties(quads, resolvedShape);

  if (!restrictions.length) {
    return `${shapeLabel} is incomplete. Check the highlighted required fields in this section.`;
  }

  return `${shapeLabel} is incomplete. Required fields in this section: ${restrictions.join('; ')}.`;
}

function extractShapeIriFromMessage(message) {
  const rawMessage = String(message ?? '');
  const iriMatch = rawMessage.match(/shape\s+<([^>]+)>/i);

  if (iriMatch?.[1]) {
    return iriMatch[1];
  }

  const compactMatch = rawMessage.match(/shape\s+([A-Za-z][\w-]*:[\w-]+)/i);
  return compactMatch?.[1] || '';
}

function findShapeTitle(quads, shape) {
  const titlePredicates = [
    'http://purl.org/dc/terms/title',
    'http://www.w3.org/2000/01/rdf-schema#label',
    SH_NAME,
  ];

  for (const predicate of titlePredicates) {
    const value = getPreferredQuadLiteral(quads, shape, predicate);

    if (value) {
      return value;
    }
  }

  return '';
}

function describeRequiredShapeProperties(quads, shape) {
  const resolvedShape = resolveShapeTerm(quads, shape);

  return quads
    .filter((item) => item.subject.equals(resolvedShape) && item.predicate.value === SH_PROPERTY)
    .map((item) => describeRequiredPropertyShape(quads, item.object))
    .filter(Boolean);
}

function describeCurrentShapeIssues(formElement, shapeQuads, shape, sectionPath = '') {
  if (!formElement || typeof formElement.serialize !== 'function') {
    return [];
  }

  try {
    const metadataContent = formElement.serialize();

    if (!String(metadataContent ?? '').trim()) {
      return [];
    }

    const dataQuads = new Parser({ format: 'text/turtle' }).parse(metadataContent);
    const rootSubject = findRootMetadataSubject(dataQuads);
    const resolvedShape = resolveShapeTerm(shapeQuads, shape);
    const resolvedSectionPath = sectionPath || findSectionPathForShape(shapeQuads, resolvedShape);
    const sectionSubject = rootSubject && resolvedSectionPath
      ? dataQuads.find((item) => item.subject.equals(rootSubject) && item.predicate.value === resolvedSectionPath)?.object
      : rootSubject;

    if (!sectionSubject) {
      return describeRequiredShapeProperties(shapeQuads, resolvedShape);
    }

    return shapeQuads
      .filter((item) => item.subject.equals(resolvedShape) && item.predicate.value === SH_PROPERTY)
      .map((item) => describeCurrentPropertyIssue(shapeQuads, dataQuads, sectionSubject, item.object))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findSectionPathForShape(quads, shape) {
  const propertyShape = quads.find(
    (item) => item.predicate.value === SH_QUALIFIED_VALUE_SHAPE && resolveShapeTerm(quads, item.object).equals(shape),
  )?.subject;

  return propertyShape ? getFirstQuadObjectValue(quads, propertyShape, SH_PATH) : '';
}

function describeCurrentPropertyIssue(shapeQuads, dataQuads, subject, propertyShape) {
  const path = getFirstQuadObjectValue(shapeQuads, propertyShape, SH_PATH);
  const minCount = Number(getFirstQuadObjectValue(shapeQuads, propertyShape, SH_MIN_COUNT) || 0);
  const minLength = Number(getFirstQuadObjectValue(shapeQuads, propertyShape, SH_MIN_LENGTH) || 0);

  if (!path || (!minCount && !minLength)) {
    return '';
  }

  const values = dataQuads
    .filter((item) => item.subject.equals(subject) && item.predicate.value === path)
    .map((item) => item.object);
  const label = getPreferredQuadLiteral(shapeQuads, propertyShape, SH_NAME) || findFieldLabelFromPath(path);
  const description = getPreferredQuadLiteral(shapeQuads, propertyShape, SH_DESCRIPTION);
  const defaultValue = getFirstQuadObjectValue(shapeQuads, propertyShape, SH_DEFAULT_VALUE);
  const issueParts = [];

  if (minCount && values.length < minCount) {
    issueParts.push(minCount === 1
      ? `${label} is required`
      : `${label} requires at least ${minCount} values, currently ${values.length}`);
  }

  if (minLength) {
    const shortestValue = values
      .filter((value) => value.termType === 'Literal')
      .map((value) => String(value.value ?? ''))
      .find((value) => value.length < minLength);

    if (!values.length && !minCount) {
      issueParts.push(`${label} must be at least ${minLength} characters`);
    } else if (shortestValue !== undefined) {
      issueParts.push(`${label} must be at least ${minLength} characters, currently ${shortestValue.length}`);
    }
  }

  if (!issueParts.length) {
    return '';
  }

  const contextParts = [];
  if (description) {
    contextParts.push(description);
  }
  if (defaultValue && !values.length) {
    contextParts.push(`default: ${defaultValue}`);
  }

  return contextParts.length
    ? `${issueParts.join('; ')}; ${contextParts.join('; ')}`
    : issueParts.join('; ');
}

function resolveShapeTerm(quads, shape) {
  if (quads.some((item) => item.subject.equals(shape))) {
    return shape;
  }

  const suffix = shape.value.split(/[\/#:]/).filter(Boolean).at(-1);
  const matchingSubject = quads.find((item) => item.subject.value.split(/[\/#:]/).filter(Boolean).at(-1) === suffix)?.subject;
  return matchingSubject || shape;
}

function describeRequiredPropertyShape(quads, propertyShape) {
  const minCount = Number(getFirstQuadObjectValue(quads, propertyShape, SH_MIN_COUNT) || 0);
  const minLength = Number(getFirstQuadObjectValue(quads, propertyShape, SH_MIN_LENGTH) || 0);

  if (!minCount && !minLength) {
    return '';
  }

  const label = getPreferredQuadLiteral(quads, propertyShape, SH_NAME) ||
    findFieldLabelFromPath(getFirstQuadObjectValue(quads, propertyShape, SH_PATH));
  const description = getPreferredQuadLiteral(quads, propertyShape, SH_DESCRIPTION);
  const defaultValue = getFirstQuadObjectValue(quads, propertyShape, SH_DEFAULT_VALUE);
  const parts = [];

  if (minCount > 1) {
    parts.push(`at least ${minCount} values`);
  } else if (minCount === 1) {
    parts.push('required');
  }

  if (minLength > 0) {
    parts.push(`minimum ${minLength} characters`);
  }

  if (defaultValue) {
    parts.push(`default: ${defaultValue}`);
  }

  return description
    ? `${label}: ${description} (${parts.join(', ')})`
    : `${label} (${parts.join(', ')})`;
}

function getPreferredQuadLiteral(quads, subject, predicateValue, preferredLanguage = 'en') {
  const values = quads
    .filter((item) => item.subject.equals(subject) && item.predicate.value === predicateValue && item.object.termType === 'Literal')
    .map((item) => item.object);
  const preferred = values.find((item) => item.language === preferredLanguage);
  const english = values.find((item) => item.language === 'en');
  const untagged = values.find((item) => !item.language);
  return (preferred || english || untagged || values[0])?.value || '';
}

function getFirstQuadObjectValue(quads, subject, predicateValue) {
  return quads.find((item) => item.subject.equals(subject) && item.predicate.value === predicateValue)?.object.value || '';
}

function getValidationResultDetails(result) {
  const constraint = result.constraintComponent?.value || result.constraintComponent?.id || '';
  const value = result.value?.value || result.value?.term?.value || result.valueOrNode?.value || '';

  if (constraint === SH_MIN_LENGTH_CONSTRAINT && typeof value === 'string' && result.args?.minLength) {
    return ` Current length: ${value.length}/${result.args.minLength}.`;
  }

  return '';
}

function collectFormValidationMessages(formElement) {
  const root = getFormRoot(formElement);
  const messages = [];

  for (const marker of root.querySelectorAll('.validation-error')) {
    const rawMessage = marker.getAttribute('title')?.trim();

    if (!rawMessage) {
      continue;
    }

    const element = marker.closest('[data-path]');
    const label = element ? findFieldLabel(element, element.dataset.path) : '';
    const message = normalizeValidationMessage(rawMessage, {
      formElement,
      label,
      path: element?.dataset.path || '',
    });
    messages.push(label && !message.startsWith(label) && !message.includes(' is incomplete.') ? `${label}: ${message}` : message);
  }

  return messages;
}

function normalizeValidationMessage(message, { formElement = null, label = '', path = '' } = {}) {
  if (isQualifiedShapeCountMessage(message)) {
    return describeQualifiedShapeCountMessage(message, { formElement, label, path });
  }

  return message;
}

function describeQualifiedShapeCountMessage(message, { formElement = null, label = '', path = '' } = {}) {
  const shapeDescription = describeShapeRestrictionsFromMessage(formElement, message, label);

  if (shapeDescription) {
    return shapeDescription;
  }

  return describeQualifiedSectionConstraint(label, path, formElement);
}

function isQualifiedShapeCountMessage(message) {
  return /\bLess than \d+ values? ha(?:s|ve) shape\b/i.test(message) ||
    /\bLes[ s]? tha[nt] \d+ values? ha(?:s|ve) shape\b/i.test(message) ||
    /\bLess tha[nt] \d+ values? ha(?:s|ve) shape\b/i.test(message);
}

function getFormMemoryContextKey(profile, resource) {
  if (profile?.shapes) {
    return `shapes:${hashString(profile.shapes)}`;
  }

  const profileKey = profile?.baseUri || resource?.applicationProfileUri;

  if (!profileKey) {
    return '';
  }

  return `${profileKey}`;
}

function getRememberedValuesSubject(contextKey) {
  return contextKey ? `urn:coscine-upload:form-memory:${hashString(contextKey)}` : '';
}

function readFormMemoryStore() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FORM_MEMORY_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeFormMemoryStore(store) {
  try {
    window.localStorage.setItem(FORM_MEMORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Browser storage can be unavailable in private modes or strict settings.
  }
}

function readRememberedFieldSelection(contextKey, profile) {
  if (!contextKey) {
    return [];
  }

  const context = readFormMemoryContext(contextKey, profile);
  return Array.isArray(context?.selectedPaths) ? context.selectedPaths : [];
}

function writeRememberedFieldSelection(contextKey, selectedPaths) {
  if (!contextKey) {
    return;
  }

  const store = readFormMemoryStore();
  store[contextKey] = {
    ...(store[contextKey] ?? {}),
    selectedPaths,
  };
  writeFormMemoryStore(store);
}

function saveRememberedFormFields({ contextKey, fieldPaths, fields, metadataContent, profile }) {
  if (!contextKey) {
    return;
  }

  if (!fieldPaths.length) {
    const store = readFormMemoryStore();
    store[contextKey] = {
      ...(store[contextKey] ?? {}),
      fields: {},
      rememberedMetadataContent: '',
      profileBaseUri: profile?.baseUri || '',
      selectedPaths: [],
      updatedAt: new Date().toISOString(),
    };
    writeFormMemoryStore(store);
    return;
  }

  if (!String(metadataContent ?? '').trim()) {
    return;
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(metadataContent);
    const rootSubject = findRootMetadataSubject(quads);
    const selectedPathSet = new Set(fieldPaths);
    const fieldLabels = new Map(fields.map((field) => [field.path, field.label]));
    const rememberedFields = {};
    const rememberedQuads = normalizeRememberedRootSubject(
      filterRememberedQuads(quads, selectedPathSet, rootSubject, profile),
      rootSubject,
      contextKey,
      profile,
    );

    for (const path of fieldPaths) {
      const values = quads
        .filter((item) => item.predicate.value === path)
        .map((item) => serializeTerm(item.object));

      if (values.length) {
        rememberedFields[path] = {
          label: fieldLabels.get(path) || findFieldLabelFromPath(path),
          values,
        };
      }
    }

    const store = readFormMemoryStore();
    store[contextKey] = {
      fields: rememberedFields,
      rememberedMetadataContent: rememberedQuads.length ? serializeQuadsSync(rememberedQuads) : '',
      profileBaseUri: profile?.baseUri || '',
      selectedPaths: fieldPaths,
      updatedAt: new Date().toISOString(),
    };
    writeFormMemoryStore(store);
  } catch {
  }
}

function buildRememberedMetadataContent(contextKey, profile) {
  if (!contextKey) {
    return '';
  }

  const context = readFormMemoryContext(contextKey, profile);
  const fields = context?.fields;
  const selectedPaths = Array.isArray(context?.selectedPaths) ? context.selectedPaths : [];

  if (!selectedPaths.length) {
    return '';
  }

  if (String(context?.rememberedMetadataContent ?? '').trim()) {
    return normalizeRememberedMetadataContent(context.rememberedMetadataContent, contextKey, profile);
  }

  if (!fields || typeof fields !== 'object') {
    return '';
  }

  try {
    const subject = namedNode(`urn:coscine-upload:form-memory:${hashString(contextKey)}`);
    const quads = [];
    const selectedPathSet = new Set(selectedPaths);

    if (profile?.baseUri) {
      quads.push(quad(subject, namedNode(DCTERMS_CONFORMS_TO), namedNode(profile.baseUri)));
    }

    for (const [path, field] of Object.entries(fields)) {
      if (!selectedPathSet.has(path)) {
        continue;
      }

      for (const value of field.values ?? []) {
        const term = deserializeTerm(value);

        if (term) {
          quads.push(quad(subject, namedNode(path), term));
        }
      }
    }

    if (!quads.length) {
      return '';
    }

    const writer = new Writer({ format: 'text/turtle' });
    writer.addQuads(quads);
    let result = '';
    writer.end((error, serialized) => {
      if (error) {
        throw error;
      }

      result = serialized;
    });
    return result;
  } catch {
    return '';
  }
}

function clearRememberedFormFields(contextKey, profile) {
  if (!contextKey) {
    return;
  }

  const store = readFormMemoryStore();
  store[contextKey] = {
    fields: {},
    rememberedMetadataContent: '',
    profileBaseUri: profile?.baseUri || '',
    selectedPaths: [],
    updatedAt: new Date().toISOString(),
  };
  writeFormMemoryStore(store);
}

function readFormMemoryContext(contextKey, profile) {
  const store = readFormMemoryStore();

  if (store[contextKey]) {
    return store[contextKey];
  }

  if (!contextKey.startsWith('shapes:')) {
    return null;
  }

  const profileFieldPaths = getProfileFieldPaths(profile);

  return Object.entries(store)
    .filter(([key, value]) => {
      if (key === contextKey || !value || (!value.rememberedMetadataContent && !value.fields)) {
        return false;
      }

      const selectedPaths = Array.isArray(value.selectedPaths) ? value.selectedPaths : [];
      return selectedPaths.some((path) => profileFieldPaths.has(path));
    })
    .sort((left, right) => String(right[1].updatedAt || '').localeCompare(String(left[1].updatedAt || '')))
    .map(([, value]) => value)[0] ?? null;
}

function getProfileFieldPaths(profile) {
  if (!profile?.shapes) {
    return new Set();
  }

  try {
    const parser = new Parser({ format: 'text/turtle' });
    return new Set(
      parser
        .parse(profile.shapes)
        .filter((item) => item.predicate.value === SH_PATH && item.object.termType === 'NamedNode')
        .map((item) => item.object.value),
    );
  } catch {
    return new Set();
  }
}

function findRootMetadataSubject(quads) {
  const conformsToSubject = quads.find((item) => item.predicate.value === DCTERMS_CONFORMS_TO)?.subject;

  if (conformsToSubject) {
    return conformsToSubject;
  }

  const subjects = new Map();
  const objectBlankNodes = new Set();

  for (const item of quads) {
    subjects.set(item.subject.id, item.subject);

    if (item.object.termType === 'BlankNode') {
      objectBlankNodes.add(item.object.id);
    }
  }

  const candidates = Array.from(subjects.values()).filter((subject) => !objectBlankNodes.has(subject.id));
  return candidates[0] ?? null;
}

function filterRememberedQuads(quads, selectedPathSet, rootSubject, profile) {
  const included = new Map();
  const selectedQuads = quads.filter((item) => selectedPathSet.has(item.predicate.value));

  for (const item of selectedQuads) {
    includeQuad(included, item);
    includeNestedValueQuads(included, quads, item.object);
    includeAncestorQuads(included, quads, item.subject, rootSubject);
  }

  if (rootSubject && profile?.baseUri) {
    includeQuad(included, quad(rootSubject, namedNode(DCTERMS_CONFORMS_TO), namedNode(profile.baseUri)));
  }

  return Array.from(included.values());
}

function normalizeRememberedMetadataContent(metadataContent, contextKey, profile) {
  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(metadataContent);
    const rootSubject = findRootMetadataSubject(quads);
    return serializeQuadsSync(normalizeRememberedRootSubject(quads, rootSubject, contextKey, profile));
  } catch {
    return metadataContent;
  }
}

function normalizeRememberedRootSubject(quads, rootSubject, contextKey, profile) {
  const rememberedSubject = namedNode(getRememberedValuesSubject(contextKey));
  const normalizedQuads = quads.map((item) =>
    quad(
      rootSubject?.equals(item.subject) ? rememberedSubject : item.subject,
      item.predicate,
      rootSubject?.equals(item.object) ? rememberedSubject : item.object,
      item.graph,
    ),
  );

  if (profile?.baseUri) {
    const hasConformsTo = normalizedQuads.some(
      (item) =>
        item.subject.equals(rememberedSubject) &&
        item.predicate.value === DCTERMS_CONFORMS_TO &&
        item.object.termType === 'NamedNode' &&
        item.object.value === profile.baseUri,
    );

    if (!hasConformsTo) {
      normalizedQuads.push(quad(rememberedSubject, namedNode(DCTERMS_CONFORMS_TO), namedNode(profile.baseUri)));
    }
  }

  return normalizedQuads;
}

function includeAncestorQuads(included, quads, subject, rootSubject, visited = new Set()) {
  if (!subject || rootSubject?.equals(subject) || visited.has(subject.id)) {
    return;
  }

  visited.add(subject.id);

  for (const item of quads) {
    if (!item.object.equals(subject)) {
      continue;
    }

    includeQuad(included, item);
    includeAncestorQuads(included, quads, item.subject, rootSubject, visited);
  }
}

function includeNestedValueQuads(included, quads, object, visited = new Set()) {
  if (!object || object.termType === 'Literal' || visited.has(object.id)) {
    return;
  }

  visited.add(object.id);

  for (const item of quads) {
    if (!item.subject.equals(object)) {
      continue;
    }

    includeQuad(included, item);
    includeNestedValueQuads(included, quads, item.object, visited);
  }
}

function includeQuad(included, item) {
  included.set(
    `${item.subject.id} ${item.predicate.id} ${item.object.id} ${item.graph.id}`,
    item,
  );
}

function serializeQuadsSync(quads) {
  const writer = new Writer({ format: 'text/turtle' });
  writer.addQuads(quads);
  let result = '';
  writer.end((error, serialized) => {
    if (error) {
      throw error;
    }

    result = serialized;
  });
  return result;
}

function serializeTerm(term) {
  return {
    datatype: term.datatype?.value || '',
    language: term.language || '',
    termType: term.termType,
    value: term.value,
  };
}

function deserializeTerm(serializedTerm) {
  if (!serializedTerm || typeof serializedTerm !== 'object') {
    return null;
  }

  if (serializedTerm.termType === 'NamedNode') {
    return namedNode(serializedTerm.value);
  }

  if (serializedTerm.termType === 'Literal') {
    if (serializedTerm.language) {
      return literal(serializedTerm.value, serializedTerm.language);
    }

    return serializedTerm.datatype
      ? literal(serializedTerm.value, namedNode(serializedTerm.datatype))
      : literal(serializedTerm.value);
  }

  return null;
}

function findFieldLabelFromPath(path) {
  return path.split(/[\/#]/).filter(Boolean).at(-1) || path;
}

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}

function hideShaclFormSubmitButton(formElement) {
  const applyStyles = () => {
    const root = formElement.shadowRoot ?? formElement;
    const overrideCss = `
      button[type="submit"],
      input[type="submit"],
      [part="submit-button"],
      .submit-button {
        display: none !important;
      }

      .property-instance.valid::before,
      .property-instance.validation-ok-field::before {
        content: none !important;
        display: none !important;
        background: none !important;
      }
    `;

    if (root.adoptedStyleSheets) {
      if (!formElement.__coscineUploadOverrideSheet) {
        formElement.__coscineUploadOverrideSheet = new CSSStyleSheet();
      }

      formElement.__coscineUploadOverrideSheet.replaceSync(overrideCss);

      if (!root.adoptedStyleSheets.includes(formElement.__coscineUploadOverrideSheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, formElement.__coscineUploadOverrideSheet];
      }
    }

    let style = root.querySelector('#coscine-upload-hide-submit');
    if (!style) {
      style = document.createElement('style');
      style.id = 'coscine-upload-hide-submit';
      root.appendChild(style);
    }

    style.textContent = `
      ${overrideCss}

      .validation-ok {
        position: absolute;
        left: -1.15em;
        top: 0.15em;
        display: inline-block;
        margin: 0;
        color: #15803d;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
        pointer-events: none;
      }

      .validation-ok-invalid {
        color: #b91c1c;
      }

      .validation-ok-label {
        position: relative !important;
      }

    `;
  };

  applyStyles();
  formElement.addEventListener('ready', applyStyles);
  window.setTimeout(applyStyles, 0);
}

function syncValidationIndicators(formElement, validationReport) {
  const root = formElement.shadowRoot ?? formElement;
  if (arguments.length > 1) {
    formElement.__coscineUploadLastValidationReport = validationReport;
  }

  const activeValidationReport = arguments.length > 1
    ? validationReport
    : formElement.__coscineUploadLastValidationReport;
  const invalidPaths = getInvalidValidationPaths(activeValidationReport);
  const hasValidationReport = Array.isArray(activeValidationReport?.results);

  for (const propertyInstance of root.querySelectorAll('.property-instance[data-path]')) {
    const field = getDirectPropertyField(propertyInstance);
    const editor = getDirectPropertyEditor(propertyInstance, field);
    const directLabel = propertyInstance.querySelector(':scope > label');
    const markerField = directLabel ? propertyInstance : field;
    const label = directLabel ?? field?.querySelector(':scope > label');

    directLabel?.querySelectorAll(':scope > .validation-ok').forEach((node) => node.remove());
    if (label) {
      label.classList.remove('validation-ok-label');
    }

    if (markerField?.previousElementSibling?.classList?.contains('validation-ok')) {
      markerField.previousElementSibling.remove();
    }

    if (markerField === propertyInstance) {
      propertyInstance.querySelectorAll(':scope > .validation-ok').forEach((node) => node.remove());
    }

    const hasDirectEditor = Boolean(editor && propertyInstance.contains(editor) && editor.closest('.property-instance') === propertyInstance);
    const hasFilledDirectEditor = hasDirectEditor && isFilledEditor(editor);

    const path = propertyInstance.dataset.path || '';
    const isInvalidByReport = hasValidationReport && invalidPaths.has(path);
    const isInvalidByFieldClass = (
      propertyInstance.classList.contains('invalid') ||
      field?.classList?.contains('invalid') ||
      editor?.classList?.contains('invalid')
    );
    const isInvalid = isInvalidByReport || isInvalidByFieldClass;

    const isValidByReport = hasValidationReport && hasFilledDirectEditor && !isInvalid;
    const isValidByFormClass = propertyInstance.classList.contains('valid') || field?.classList?.contains('valid');
    if (isInvalid) {
      const badge = document.createElement('span');
      badge.className = 'validation-ok validation-ok-invalid';
      badge.textContent = '!';
      badge.setAttribute('aria-hidden', 'true');

      if (markerField && label) {
        if (label.querySelector(':scope > .validation-ok')) {
          continue;
        }
        label.classList.add('validation-ok-label');
        label.insertBefore(badge, label.firstChild);
      } else if (markerField) {
        if (markerField.previousElementSibling?.classList?.contains('validation-ok')) {
          continue;
        }
        markerField.insertAdjacentElement('beforebegin', badge);
      } else if (!propertyInstance.querySelector(':scope > .validation-ok')) {
        propertyInstance.insertAdjacentElement('afterbegin', badge);
      }
      continue;
    }

    if (!hasDirectEditor || !hasFilledDirectEditor || (!isValidByReport && !isValidByFormClass)) {
      continue;
    }

    const badge = document.createElement('span');
    badge.className = 'validation-ok';
    badge.textContent = '✓';
    badge.setAttribute('aria-hidden', 'true');

    if (markerField && label) {
      if (label.querySelector(':scope > .validation-ok')) {
        continue;
      }
      label.classList.add('validation-ok-label');
      label.insertBefore(badge, label.firstChild);
    } else if (markerField) {
      if (markerField.previousElementSibling?.classList?.contains('validation-ok')) {
        continue;
      }
      markerField.insertAdjacentElement('beforebegin', badge);
    } else {
      if (propertyInstance.querySelector(':scope > .validation-ok')) {
        continue;
      }
      propertyInstance.insertAdjacentElement('afterbegin', badge);
    }
  }
}

function getDirectPropertyField(propertyInstance) {
  return propertyInstance.querySelector(':scope > [part~="field"], :scope > .field') || propertyInstance;
}

function getDirectPropertyEditor(propertyInstance, field = getDirectPropertyField(propertyInstance)) {
  return propertyInstance.querySelector(':scope > .editor') || field?.querySelector?.(':scope > .editor') || null;
}

function getInvalidValidationPaths(validationReport) {
  const results = collectValidationResults(validationReport);
  return new Set(results.map(getValidationResultPath).filter(Boolean));
}

function collectValidationResults(validationReport) {
  const results = [];
  const stack = Array.isArray(validationReport?.results) ? [...validationReport.results] : [];

  while (stack.length) {
    const result = stack.shift();
    if (!result || typeof result !== 'object') {
      continue;
    }

    results.push(result);

    if (Array.isArray(result.results) && result.results.length) {
      stack.unshift(...result.results);
    }
  }

  return results;
}

function isFilledEditor(editor) {
  if (!editor) {
    return false;
  }

  if (editor.type === 'checkbox') {
    return Boolean(editor.checked);
  }

  if (editor.type === 'file') {
    return Boolean(editor.files?.length || editor.binaryData);
  }

  if (editor.tagName === 'SELECT') {
    return String(editor.value ?? '').trim() !== '';
  }

  return String(editor.value ?? '').trim() !== '';
}

function groupResourcesByProject(resources) {
  const projects = new Map();

  for (const resource of resources) {
    const id = resource.projectId;
    const currentProject = projects.get(id) ?? {
      id,
      name: getProjectDisplayName(resource),
      resources: [],
    };

    currentProject.resources.push(resource);
    projects.set(id, currentProject);
  }

  return Array.from(projects.values());
}

function resourceKey(resource) {
  return `${resource.projectId}:${resource.resourceId}`;
}

function getResourceDisplayName(resource) {
  const resourceName = String(resource.resourceName ?? '').trim();
  const resourceId = String(resource.resourceId ?? '').trim();
  return resourceName &&
    resourceName !== resourceId &&
    !isTechnicalDisplayValue(resourceName)
    ? resourceName
    : 'Unnamed resource';
}

function getProjectDisplayName(resource) {
  const projectName = String(resource?.projectName ?? '').trim();
  return projectName && !isTechnicalDisplayValue(projectName) ? projectName : 'Unnamed project';
}

function getResourceTypeDisplayName(resource) {
  const resourceType = String(resource?.resourceType ?? '').trim();
  return resourceType && !isTechnicalDisplayValue(resourceType) ? resourceType : '';
}

function isTechnicalDisplayValue(value) {
  const normalizedValue = String(value ?? '').trim();
  return (
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(normalizedValue) ||
    /^(?:https?:\/\/|urn:)/i.test(normalizedValue)
  );
}

function resourceNameFromFileName(fileName) {
  return String(fileName ?? '').replace(/_+/g, ' ').trim();
}

function getUploadTargetPath(file, targetPath, fileCount) {
  const normalizedTargetPath = String(targetPath ?? '').trim().replace(/^\/+/, '');

  if (fileCount === 1) {
    return normalizedTargetPath || file.name;
  }

  if (!normalizedTargetPath) {
    return file.name;
  }

  return `${normalizedTargetPath.replace(/\/+$/, '')}/${file.name}`;
}

function formatSelectedFilesLabel(files) {
  if (!files.length) {
    return 'None';
  }

  if (files.length === 1) {
    return files[0].name;
  }

  return `${files.length} files selected`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return 'n/a';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const rootElement = document.getElementById('root');
rootElement.__coscineUploadRoot ??= createRoot(rootElement);
rootElement.__coscineUploadRoot.render(<App />);
