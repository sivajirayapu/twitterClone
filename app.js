const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at 3000 Port");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userQuery = `
            SELECT 
                * 
            FROM 
                user 
            WHERE 
                username = '${username}';`;
  const dbResponse = await db.get(userQuery);
  console.log(dbResponse);

  const hashedPassword = await bcrypt.hash(password, 10);

  if (dbResponse === undefined) {
    const passwordLength = password.length;
    const query = `INSERT INTO  user (name, username, password, gender)VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const dbResponse = await db.run(query);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const query = `
                SELECT 
                * 
            FROM 
                user 
            WHERE 
                username = '${username}';`;
  const dbResponse = await db.get(query);

  if (dbResponse !== undefined) {
    const validateUserPassword = await bcrypt.compare(
      password,
      dbResponse.password
    );
    if (validateUserPassword === true) {
      const payload = {
        username: username,
        userId: dbResponse.user_id,
      };
      const jwtToken = jwt.sign(payload, "Sivaji_Rayapu");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// middleware function
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "Sivaji_Rayapu", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// API @2

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username, userId } = request;

    const followingUsersQuery = `SELECT following_user_id AS followingUserId FROM follower WHERE follower_user_id = ${userId};`;
    const followingUsersIds = await db.all(followingUsersQuery);
    const userIdsForFollowing = followingUsersIds.map(
      (eachId) => eachId.followingUserId
    );
    console.log(userIdsForFollowing);

    const tweetsOfFollowingUser = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime FROM tweet NATURAL JOIN user WHERE tweet.user_id  IN (${userIdsForFollowing}) ORDER BY tweet.date_time DESC LIMIT 4;`;
    const tweetsFromFollowingUsers = await db.all(tweetsOfFollowingUser);
    response.send(tweetsFromFollowingUsers);
  }
);

/// API 4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const followingUsers = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId};`;
  const dbResponse = await db.all(followingUsers);
  const followingUsersIds = dbResponse.map(
    (eachUser) => eachUser.following_user_id
  );
  console.log(followingUsersIds);

  const usernamesQuery = `SELECT name FROM user WHERE user_id IN (${followingUsersIds});`;
  const dbResponse2 = await db.all(usernamesQuery);
  console.log(dbResponse2);
  response.send(dbResponse2);
});

// API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const followersQuery = `SELECT follower_user_id FROM follower WHERE following_user_id = ${userId};`;
  const followersIds = await db.all(followersQuery);
  const userFollowersIds = followersIds.map(
    (eachUser) => eachUser.follower_user_id
  );

  const followersNamesQuery = `SELECT name FROM user WHERE user_id IN (${userFollowersIds});`;
  const dbResponse = await db.all(followersNamesQuery);
  response.send(dbResponse);
});

// API 6 middleware
const validateTweetId = async (request, response, next) => {
  const { username, userId } = request;
  const { tweetId } = request.params;
  console.log(tweetId);

  const followingIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId};`;
  const followingIds = await db.all(followingIdsQuery);
  const followingIdsArr = followingIds.map(
    (eachId) => eachId.following_user_id
  );
  console.log(followingIdsArr);

  const tweetIdsQuery = `SELECT tweet FROM tweet WHERE user_id IN (${followingIdsArr});`;
  const tweetIds = await db.all(tweetIdsQuery);
  const tweetIdsArr = tweetIds.map((eachId) => eachId.tweet);
  console.log(tweetIdsArr);

  const specificTweetQuery = `SELECT tweet FROM tweet WHERE tweet_id = ${tweetId};`;
  const specificTweet = await db.get(specificTweetQuery);

  const validateTweetId = tweetIdsArr.includes(specificTweet.tweet);

  if (validateTweetId === true) {
    request.username = username;
    request.userId = userId;
    request.tweetId = tweetId;
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

// API 6
app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  validateTweetId,
  async (request, response) => {
    const { username, userId, tweetId } = request;
    console.log(tweetId);

    const query = `SELECT tweet.tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply_id) AS replies, tweet.date_time AS dateTime FROM tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = like.tweet_id WHERE tweet.tweet_id = ${tweetId} GROUP BY tweet.tweet_id;`;
    const dbResponse = await db.get(query);
    console.log(dbResponse);
    response.send(dbResponse);
  }
);

/// API 7

const returnObject = (arr) => {
  return {
    likes: arr,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  validateTweetId,
  async (request, response) => {
    const { username, userId, tweetId } = request;
    const likeQueryUsers = `SELECT user_id AS userId FROM like WHERE tweet_id = ${tweetId};`;
    const dbResponse = await db.all(likeQueryUsers);
    console.log(dbResponse);
    // response.send(dbResponse);
    const likedUsers = dbResponse.map((eachUser) => eachUser.userId);
    console.log(likedUsers);

    const responseQuery = `SELECT username FROM user WHERE user_id IN (${likedUsers});`;
    const dbResponse2 = await db.all(responseQuery);
    const usernames = dbResponse2.map((eachUser) => eachUser.username);
    console.log(usernames);

    response.send(returnObject(usernames));
  }
);

// API 8
const returnObjectReply = (object) => {
  return {
    reply: object,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  validateTweetId,
  async (request, response) => {
    const { username, userId, tweetId } = request;
    const replyQueryUsers = `SELECT user.name, reply.reply FROM reply NATURAL JOIN user WHERE tweet_id = ${tweetId};`;
    const dbResponse = await db.all(replyQueryUsers);
    console.log(dbResponse);
    response.send(returnObjectReply(dbResponse));
  }
);

// API 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  console.log(userId);

  const tweetIdsQuery = `SELECT tweet.tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply_id) AS replies, tweet.date_time AS dateTime FROM tweet LEFT JOIN like ON like.tweet_id = tweet.tweet_id LEFT JOIN reply ON reply.tweet_id = like.tweet_id WHERE tweet.user_id = ${userId} GROUP BY tweet.tweet_id;`;
  const tweetIdsResponse = await db.all(tweetIdsQuery);
  //   const tweetIds = tweetIdsResponse.map((eachId) => eachId.tweet_id);
  //   console.log(tweetIds);

  //   const query = `SELECT * FROM tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id LEFT JOIN reply ON reply.tweet_id = like.tweet_id WHERE tweet.tweet_id In (${tweetIds}) GROUP BY tweet.tweet_id;`;
  //   const tweetResponse = await db.all(query);

  //   const replyAndLikeQuery = `SELECT * FROM like INNER JOIN reply ON like.tweet_id = reply.tweet_id WHERE like.tweet_id = ${tweetResponse.tweet_id};`;
  //   const dbResponse = await db.get(replyAndLikeQuery);

  response.send(tweetIdsResponse);
});

// API 10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const { tweet } = request.body;
  const date = new Date();

  const query = `INSERT INTO tweet (user_id, tweet) VALUES (${userId}, '${tweet}');`;
  const dbResponse = await db.run(query);
  response.send("Created a Tweet");
});

/// API 11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  validateTweetId,
  async (request, response) => {
    const { username, userId, tweetId } = request;
    const query = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    const dbResponse = await db.run(query);
    response.send("Tweet Removed");
  }
);

module.exports = app;
