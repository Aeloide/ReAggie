
/**
 * MongoDB schema recreation script generated on: 2025-08-22T20:20:39.136Z
 * Database: puzzle
 *
 * This script can be run standalone to apply the schema to a target database.
 *
 * Usage:
 * bun run <script_name>.ts <connection_string> <database_name>
 *
 * Example:
 * bun run generateSchema.ts mongodb://localhost:27017 my_new_db
 */
import { MongoClient, Db } from 'mongodb';

/**
 * The core logic to recreate the schema in a given database.
 * @param db An active MongoDB database instance.
 */
async function recreateSchema(db: Db) {
  console.log(`Starting schema recreation for database: "${db.databaseName}"...`);


  // --- Collection: warns ---
  try {
    const collectionExists = await db.listCollections({ name: "warns" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "warns"...');
      await db.createCollection("warns", {});
      console.log('Collection "warns" created successfully.');
    } else {
      console.log('Collection "warns" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "warns":', error);
  }

  // Indexes for collection: warns
  try {
    console.log('Ensuring indexes for "warns"...');

    await db.collection("warns").createIndex({ "low": 1, "hi": -1 }, {
      "name": "ips",
      "background": false
    });

    await db.collection("warns").createIndex({ "v": 1 }, {
      "name": "type",
      "background": false
    });

    console.log('Indexes for "warns" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "warns":', error);
  }

  // --- Collection: tokensc ---
  try {
    const collectionExists = await db.listCollections({ name: "tokensc" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "tokensc"...');
      await db.createCollection("tokensc", {});
      console.log('Collection "tokensc" created successfully.');
    } else {
      console.log('Collection "tokensc" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "tokensc":', error);
  }

  // --- Collection: sessions ---
  try {
    const collectionExists = await db.listCollections({ name: "sessions" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "sessions"...');
      await db.createCollection("sessions", {});
      console.log('Collection "sessions" created successfully.');
    } else {
      console.log('Collection "sessions" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "sessions":', error);
  }

  // Indexes for collection: sessions
  try {
    console.log('Ensuring indexes for "sessions"...');

    await db.collection("sessions").createIndex({ "expires": 1 }, {
      "name": "expires_1",
      "background": true,
      "expireAfterSeconds": 0
    });

    console.log('Indexes for "sessions" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "sessions":', error);
  }

  // --- Collection: asncap ---
  try {
    const collectionExists = await db.listCollections({ name: "asncap" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "asncap"...');
      await db.createCollection("asncap", {});
      console.log('Collection "asncap" created successfully.');
    } else {
      console.log('Collection "asncap" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "asncap":', error);
  }

  // Indexes for collection: asncap
  try {
    console.log('Ensuring indexes for "asncap"...');

    await db.collection("asncap").createIndex({ "asn": 1 }, {
      "name": "asn",
      "background": false,
      "unique": true
    });

    console.log('Indexes for "asncap" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "asncap":', error);
  }

  // --- Collection: bans ---
  try {
    const collectionExists = await db.listCollections({ name: "bans" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "bans"...');
      await db.createCollection("bans", {});
      console.log('Collection "bans" created successfully.');
    } else {
      console.log('Collection "bans" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "bans":', error);
  }

  // Indexes for collection: bans
  try {
    console.log('Ensuring indexes for "bans"...');

    await db.collection("bans").createIndex({ "v": 1 }, {
      "name": "type",
      "background": false
    });

    await db.collection("bans").createIndex({ "low": 1, "hi": -1 }, {
      "name": "ips",
      "background": false
    });

    console.log('Indexes for "bans" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "bans":', error);
  }

  // --- Collection: goodgoys ---
  try {
    const collectionExists = await db.listCollections({ name: "goodgoys" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "goodgoys"...');
      await db.createCollection("goodgoys", {});
      console.log('Collection "goodgoys" created successfully.');
    } else {
      console.log('Collection "goodgoys" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "goodgoys":', error);
  }

  // Indexes for collection: goodgoys
  try {
    console.log('Ensuring indexes for "goodgoys"...');

    await db.collection("goodgoys").createIndex({ "low": 1, "hi": -1 }, {
      "name": "low_1_hi_-1"
    });

    console.log('Indexes for "goodgoys" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "goodgoys":', error);
  }

  // --- Collection: reports ---
  try {
    const collectionExists = await db.listCollections({ name: "reports" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "reports"...');
      await db.createCollection("reports", {});
      console.log('Collection "reports" created successfully.');
    } else {
      console.log('Collection "reports" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "reports":', error);
  }

  // Indexes for collection: reports
  try {
    console.log('Ensuring indexes for "reports"...');

    await db.collection("reports").createIndex({ "roomid": 1 }, {
      "name": "roomnames"
    });

    await db.collection("reports").createIndex({ "room.ext.reportedBy": 1 }, {
      "name": "repo",
      "background": false
    });

    await db.collection("reports").createIndex({ "room.ext.count": 1 }, {
      "name": "rec",
      "background": false
    });

    await db.collection("reports").createIndex({ "_fts": "text", "_ftsx": 1 }, {
      "name": "text",
      "background": false,
      "weights": {
        "state.chatlog.message": 1
      },
      "default_language": "english",
      "language_override": "language",
      "textIndexVersion": 3
    });

    await db.collection("reports").createIndex({ "state.hidlog": 1 }, {
      "name": "hidlog",
      "background": false
    });

    console.log('Indexes for "reports" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "reports":', error);
  }

  // --- Collection: intents ---
  try {
    const collectionExists = await db.listCollections({ name: "intents" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "intents"...');
      await db.createCollection("intents", {});
      console.log('Collection "intents" created successfully.');
    } else {
      console.log('Collection "intents" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "intents":', error);
  }

  // --- Collection: players ---
  try {
    const collectionExists = await db.listCollections({ name: "players" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "players"...');
      await db.createCollection("players", {});
      console.log('Collection "players" created successfully.');
    } else {
      console.log('Collection "players" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "players":', error);
  }

  // Indexes for collection: players
  try {
    console.log('Ensuring indexes for "players"...');

    await db.collection("players").createIndex({ "ip": 1 }, {
      "name": "ip_1"
    });

    await db.collection("players").createIndex({ "last_seen": 1 }, {
      "name": "last_seen_1"
    });

    console.log('Indexes for "players" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "players":', error);
  }

  // --- Collection: badgoys ---
  try {
    const collectionExists = await db.listCollections({ name: "badgoys" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "badgoys"...');
      await db.createCollection("badgoys", {});
      console.log('Collection "badgoys" created successfully.');
    } else {
      console.log('Collection "badgoys" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "badgoys":', error);
  }

  // Indexes for collection: badgoys
  try {
    console.log('Ensuring indexes for "badgoys"...');

    await db.collection("badgoys").createIndex({ "low": 1, "hi": -1 }, {
      "name": "low_1_hi_-1"
    });

    console.log('Indexes for "badgoys" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "badgoys":', error);
  }

  // --- Collection: rooms ---
  try {
    const collectionExists = await db.listCollections({ name: "rooms" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "rooms"...');
      await db.createCollection("rooms", {});
      console.log('Collection "rooms" created successfully.');
    } else {
      console.log('Collection "rooms" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "rooms":', error);
  }

  // Indexes for collection: rooms
  try {
    console.log('Ensuring indexes for "rooms"...');

    await db.collection("rooms").createIndex({ "roomid": 1 }, {
      "name": "roomnames"
    });

    await db.collection("rooms").createIndex({ "room.endTime": 1 }, {
      "name": "roomEndTime",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.pieces": 1 }, {
      "name": "roompieces",
      "background": false
    });

    await db.collection("rooms").createIndex({ "state.gid": 1 }, {
      "name": "roomstategid",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.sets.image": 1 }, {
      "name": "roomsets",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.ext.playlist.id": 1 }, {
      "name": "songsids",
      "background": false
    });

    await db.collection("rooms").createIndex({ "state.modstate.score.scores": 1 }, {
      "name": "statemod",
      "background": false
    });

    await db.collection("rooms").createIndex({ "state.chatlog.name": 1 }, {
      "name": "chatlgosnames",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.ext.selfdestruct": 1 }, {
      "name": "sd",
      "background": false
    });

    await db.collection("rooms").createIndex({ "state.createdBy": 1 }, {
      "name": "statecreated",
      "background": false
    });

    await db.collection("rooms").createIndex({ "_fts": "text", "_ftsx": 1 }, {
      "name": "msgs",
      "background": false,
      "weights": {
        "state.chatlog.message": 1
      },
      "default_language": "english",
      "language_override": "language",
      "textIndexVersion": 3
    });

    await db.collection("rooms").createIndex({ "state.hidlog": 1 }, {
      "name": "hidlog",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.ext.censoredCount": 1 }, {
      "name": "censored",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.startTime": 1 }, {
      "name": "room.startTime_1"
    });

    await db.collection("rooms").createIndex({ "state.refs": 1 }, {
      "name": "resf",
      "background": false
    });

    await db.collection("rooms").createIndex({ "room.key": 1 }, {
      "name": "keys",
      "background": false
    });

    await db.collection("rooms").createIndex({ "state.hostName": 1 }, {
      "name": "state.hostName_1"
    });

    await db.collection("rooms").createIndex({ "state.bannedips": 1 }, {
      "name": "state.bannedips_1"
    });

    await db.collection("rooms").createIndex({ "state.chatlog": 1 }, {
      "name": "state.chatlog_1"
    });

    await db.collection("rooms").createIndex({ "state.chatlog.ts": 1 }, {
      "name": "state.chatlog.ts_1"
    });

    await db.collection("rooms").createIndex({ "state.hidlog.sender": 1 }, {
      "name": "state.hidlog.sender_1"
    });

    await db.collection("rooms").createIndex({ "room.name": 1 }, {
      "name": "room.name_1"
    });

    console.log('Indexes for "rooms" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "rooms":', error);
  }

  // --- Collection: publicWarns ---
  try {
    const collectionExists = await db.listCollections({ name: "publicWarns" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "publicWarns"...');
      await db.createCollection("publicWarns", {});
      console.log('Collection "publicWarns" created successfully.');
    } else {
      console.log('Collection "publicWarns" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "publicWarns":', error);
  }

  // --- Collection: followersc ---
  try {
    const collectionExists = await db.listCollections({ name: "followersc" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "followersc"...');
      await db.createCollection("followersc", {});
      console.log('Collection "followersc" created successfully.');
    } else {
      console.log('Collection "followersc" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "followersc":', error);
  }

  // --- Collection: infologs ---
  try {
    const collectionExists = await db.listCollections({ name: "infologs" }).hasNext();
    if (!collectionExists) {
      console.log('Creating collection: "infologs"...');
      await db.createCollection("infologs", {});
      console.log('Collection "infologs" created successfully.');
    } else {
      console.log('Collection "infologs" already exists.');
    }
  } catch (error) {
    console.error('Error creating collection "infologs":', error);
  }

  // Indexes for collection: infologs
  try {
    console.log('Ensuring indexes for "infologs"...');

    await db.collection("infologs").createIndex({ "time": 1 }, {
      "name": "time_1",
      "expireAfterSeconds": 86400
    });

    await db.collection("infologs").createIndex({ "room": 1 }, {
      "name": "room_1"
    });

    console.log('Indexes for "infologs" are in place.');
  } catch (error) {
    console.error('Error creating indexes for "infologs":', error);
  }

  // --- View: reportshort ---
  try {
    const viewExists = await db.listCollections({ name: "reportshort" }).hasNext();
    if (!viewExists) {
      console.log('Creating view: "reportshort"...');
      await db.createCollection("reportshort", {
        "viewOn": "reports",
        "pipeline": [
          {
            "$project": {
              "room": "$roomid",
              "ips": "$room.ext.reportedBy",
              "reasons": "$room.ext.reasons"
            }
          }
        ]
      });
      console.log('View "reportshort" created successfully.');
    } else {
      console.log('View "reportshort" already exists.');
    }
  } catch (error) {
    console.error('Error creating view "reportshort":', error);
  }

  // --- View: players_last_week ---
  try {
    const viewExists = await db.listCollections({ name: "players_last_week" }).hasNext();
    if (!viewExists) {
      console.log('Creating view: "players_last_week"...');
      await db.createCollection("players_last_week", {
        "viewOn": "players",
        "pipeline": [
          {
            "$match": {
              "$expr": {
                "$gte": [
                  "$last_seen",
                  {
                    "$toLong": {
                      "$subtract": [
                        "$$NOW",
                        604800000
                      ]
                    }
                  }
                ]
              }
            }
          }
        ]
      });
      console.log('View "players_last_week" created successfully.');
    } else {
      console.log('View "players_last_week" already exists.');
    }
  } catch (error) {
    console.error('Error creating view "players_last_week":', error);
  }

  // --- View: frequentReporters ---
  try {
    const viewExists = await db.listCollections({ name: "frequentReporters" }).hasNext();
    if (!viewExists) {
      console.log('Creating view: "frequentReporters"...');
      await db.createCollection("frequentReporters", {
        "viewOn": "reports",
        "pipeline": [
          {
            "$project": {
              "ips": "$room.ext.reportedBy"
            }
          },
          {
            "$unwind": {
              "path": "$ips",
              "preserveNullAndEmptyArrays": false
            }
          },
          {
            "$group": {
              "_id": "$ips",
              "total": {
                "$sum": 1
              }
            }
          },
          {
            "$sort": {
              "total": -1
            }
          }
        ]
      });
      console.log('View "frequentReporters" created successfully.');
    } else {
      console.log('View "frequentReporters" already exists.');
    }
  } catch (error) {
    console.error('Error creating view "frequentReporters":', error);
  }

  // --- View: players_last_day ---
  try {
    const viewExists = await db.listCollections({ name: "players_last_day" }).hasNext();
    if (!viewExists) {
      console.log('Creating view: "players_last_day"...');
      await db.createCollection("players_last_day", {
        "viewOn": "players",
        "pipeline": [
          {
            "$match": {
              "$expr": {
                "$gte": [
                  "$last_seen",
                  {
                    "$toLong": {
                      "$subtract": [
                        "$$NOW",
                        86400000
                      ]
                    }
                  }
                ]
              }
            }
          }
        ]
      });
      console.log('View "players_last_day" created successfully.');
    } else {
      console.log('View "players_last_day" already exists.');
    }
  } catch (error) {
    console.error('Error creating view "players_last_day":', error);
  }

  // --- View: players_last_month ---
  try {
    const viewExists = await db.listCollections({ name: "players_last_month" }).hasNext();
    if (!viewExists) {
      console.log('Creating view: "players_last_month"...');
      await db.createCollection("players_last_month", {
        "viewOn": "players",
        "pipeline": [
          {
            "$match": {
              "$expr": {
                "$gte": [
                  "$last_seen",
                  {
                    "$toLong": {
                      "$subtract": [
                        "$$NOW",
                        2592000000
                      ]
                    }
                  }
                ]
              }
            }
          }
        ]
      });
      console.log('View "players_last_month" created successfully.');
    } else {
      console.log('View "players_last_month" already exists.');
    }
  } catch (error) {
    console.error('Error creating view "players_last_month":', error);
  }

  // --- View: players_last_hour ---
  try {
    const viewExists = await db.listCollections({ name: "players_last_hour" }).hasNext();
    if (!viewExists) {
      console.log('Creating view: "players_last_hour"...');
      await db.createCollection("players_last_hour", {
        "viewOn": "players",
        "pipeline": [
          {
            "$match": {
              "$expr": {
                "$gte": [
                  "$last_seen",
                  {
                    "$toLong": {
                      "$subtract": [
                        "$$NOW",
                        3600000
                      ]
                    }
                  }
                ]
              }
            }
          }
        ]
      });
      console.log('View "players_last_hour" created successfully.');
    } else {
      console.log('View "players_last_hour" already exists.');
    }
  } catch (error) {
    console.error('Error creating view "players_last_hour":', error);
  }
}

// --- Standalone Execution Logic ---

/**
 * Main function to run the script from the command line.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Missing required arguments.');
    console.error('Usage: bun run <script_name>.ts <connection_string> <database_name>');
    process.exit(1);
  }

  const targetConnectionString = args[0];
  const targetDbName = args[1];

  console.log(`Connecting to target MongoDB at ${targetConnectionString}...`);
  const client = new MongoClient(targetConnectionString);

  try {
    await client.connect();
    console.log('Successfully connected to target MongoDB.');
    const db = client.db(targetDbName);

    // Run the main schema recreation logic
    await recreateSchema(db);

  } catch (err) {
    console.error('An error occurred during the standalone execution:', err);
  } finally {
    await client.close();
    console.log('\nConnection to target MongoDB closed.');
  }
}

// This allows the script to be run directly from the command line
if (import.meta.main) {
  main().catch(err => {
    console.error("A top-level error occurred:", err);
    process.exit(1);
  });
}
