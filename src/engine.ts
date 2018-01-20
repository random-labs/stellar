import { resolve, normalize, basename } from 'path';
import { SatelliteInterface } from './satellite.interface';
import { Satellite } from './satellite';
import { EngineStatus } from './engine-status.enum';
import { LogLevel } from './log-level.enum';

/**
 * Main entry point for the Stellar code.
 * 
 * This makes the system bootstrap, loading and executing all satellites.
 * Each satellite load new features to the Engine instance and could perform
 * a set of instructions to accomplish a certain goal.
 */
export default class Engine {
  /**
   * List of all loaded Satellites.
   */
  private satellites: Map<string, SatelliteInterface> = null;

  private satellitesLoadOrder: Map<number, Array<SatelliteInterface>> = null;
  private satellitesStartOrder: Map<number, Array<SatelliteInterface>> = null;
  private satellitesStopOrder: Map<number, Array<SatelliteInterface>> = null;

  private loadSatellites = null;
  private startSatellites = null;
  private stopSatellites = null;

  /**
   * API object.
   *
   * This object contains all the logic shared across all platform. It's here
   * Satellites will load logic and developers access the functions.
   */
  private api: any = {
    bootTime: null,
    status: EngineStatus.Stopped,
    log: null,
    scope: {},
  };

  constructor(scope) {
    this.api = {
      ...this.api,
      log: this.log,
      scope,
    };

    this.api.scope = {
      ...this.api.scope,
      args: scope.args,
    };
  }

  private log(msg: any, level: LogLevel = LogLevel.Info) {
    // when it's running on a test environment the logs are disabled
    if (process.env.NODE_ENV === 'test') { return; }

    switch (level) {
      case LogLevel.Emergency || LogLevel.Error:
        console.log(`\x1b[31m[-] ${msg}\x1b[37m`);
        break;
      case LogLevel.Info:
        console.log(`[!] ${msg}`);
        break;
    }
  }

  private fatalError(errors: Array<Error> | Error, type: string) {
    if (!errors) { throw new Error('There must be passed at lest one Error'); }
    if (!Array.isArray(errors)) { errors = [errors]; }

    this.log(`Error with satellite step: ${type}`, LogLevel.Emergency);
    errors.forEach(error => this.api(error, LogLevel.Emergency));

    // TODO: stop process execution
  }

  /**
   * Function to load the satellites in the right place given they priorities.
   *
   * @param satellitesFiles Array of paths.
   */
  private loadArrayOfSatellites(satellitesFiles): void {
    for (const path of satellitesFiles) {
      const file = normalize(path);
      const satelliteName = basename(file).split('.')[0];
      const extension = file.split('.').pop();

      // only load files with the `js` extension
      if (extension !== 'js') { continue; }

      const SatelliteClass = require(file).default;
      const satelliteInstance: SatelliteInterface = new SatelliteClass(this.api);

      this.satellites[satelliteName] = satelliteInstance;

      this.satellitesLoadOrder[satelliteInstance.loadPriority] = this.satellitesLoadOrder[satelliteInstance.loadPriority] || [];
      this.satellitesStartOrder[satelliteInstance.startPriority] = this.satellitesStartOrder[satelliteInstance.loadPriority] || [];
      this.satellitesStopOrder[satelliteInstance.stopPriority] = this.satellitesStopOrder[satelliteInstance.loadPriority] || [];

      this.satellitesLoadOrder[satelliteInstance.loadPriority].push(satelliteInstance);
      this.satellitesStartOrder[satelliteInstance.startPriority].push(satelliteInstance);
      this.satellitesStopOrder[satelliteInstance.stopPriority].push(satelliteInstance);
    }
  }

  /**
   * Order a collection of satellites by their priority.
   *
   * @param collection Collection of satellites to be ordered.
   */
  private flattenOrderedSatellites(collection) {
    const output = [];

    Object.keys(collection)
      .map(k => parseInt(k, 10))
      .sort((a, b) => a - b)
      .forEach(k => collection[k].forEach(d => output.push(d)));

    return output;
  }

  /**
   * Second startup stage.
   *
   * Steps:
   *  - load all satellites into memory;
   *  - load satellites;
   *  - mark Engine like initialized;
   */
  private async stage1(): Promise<void> {
    this.api.status = EngineStatus.Stage1;

    this.satellitesLoadOrder = new Map();
    this.satellitesStartOrder = new Map();
    this.satellitesStopOrder = new Map();

    // load the core satellites
    this.loadArrayOfSatellites(this.api.utils.getFiles(`${__dirname}/satellites`));

    // load module satellites
    this.api.configs.modules.forEach(moduleName => {
      const moduleSatellitesPath = `${this.api.scope.rootPath}/modules/${moduleName}/satellites`;
      if (this.api.utils.dirExists(moduleSatellitesPath)) {
        this.loadArrayOfSatellites(this.api.utils.getFiles(moduleSatellitesPath));
      }
    });

    // organize final array to match the satellites priorities
    this.loadSatellites = this.flattenOrderedSatellites(this.satellitesLoadOrder);
    this.startSatellites = this.flattenOrderedSatellites(this.satellitesStartOrder);
    this.stopSatellites = this.flattenOrderedSatellites(this.satellitesStopOrder);

    try {
      for (const satelliteInstance of this.loadSatellites) {
        if (typeof satelliteInstance.load !== 'function') {
          continue;
        }

        this.api.log(`> load: ${satelliteInstance.name}`, LogLevel.Debug);
        await satelliteInstance.load();
        this.api.log(`> loaded: ${satelliteInstance.name}`, LogLevel.Debug);
      }
    } catch (e) {
      this.fatalError(e, 'stage1');
    }
  }

  /**
   * First startup stage.
   *
   * This step is responsible to execute the initial
   * Satellites.
   */
  public async initialize(): Promise<Engine> {
    const satellitesToLoad: SatelliteInterface[] = [];

    this.satellites = new Map();

    this.log(`Current universe "${this.api.scope.rootPath}"`, LogLevel.Info);
    this.api.status = EngineStatus.Stage0;

    // the `utils` and `config` Satellites needs to be loaded
    // first. They contains some functions that are needed
    // durning the startup process.
    const initialSatellites = [
      resolve(`${__dirname}/satellites/utils.js`),
      resolve(`${__dirname}/satellites/config.js`),
    ];

    for (const file of initialSatellites) {
      const fileName = file.replace(/^.*[\\\/]/, '');
      const satellite = fileName.split('.')[0];

      const currentSatellite = new (require(file).default)(this.api);
      this.satellites[satellite] = currentSatellite;

      try {
        await currentSatellite.load();
      } catch (error) {
        this.fatalError(error, 'stage0');
      }
    }

    return this;
  }

  public async start(): Promise<Engine> {
    throw new Error('Not implemented');
  }

  public async restart(): Promise<Engine> {
    throw new Error('Not implemented');
  }

  public async stop(): Promise<Engine> {
    throw new Error('Not implemented');
  }
}
