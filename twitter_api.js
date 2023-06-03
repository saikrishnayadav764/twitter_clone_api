const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const dbPath = path.join(__dirname, "twitterClone.db");
const jwt = require("jsonwebtoken");
const format = require("date-fns/format");
let db;

const server = async () => {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
};

server();
app.use(express.json());

// API 1
app.post("/register", async (req, res) => {
  const { username, password, name, gender } = req.body;
  let query = `SELECT * FROM user WHERE username = '${username}'`;
  let result = await db.get(query);
  if (result !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else {
    if (password.length < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      let pass = await bcrypt.hash(password, 10);
      query = `INSERT INTO user(name, username, password, gender) 
          VALUES ('${name}', '${username}', '${pass}',' ${gender}')`;
      result = await db.run(query);
      res.status(200);
      res.send("User created successfully");
    }
  }
});

// API 2
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  let query = `SELECT * FROM user WHERE username = '${username}'`;
  let result = await db.get(query);
  if (result === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    let is_pass = await bcrypt.compare(password, result.password);
    if (is_pass) {
      const payload = {
        username: username,
      };
      let token = jwt.sign(payload, "SECRET");
      res.send({ jwtToken: token });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

// Authentication with JWT Token

const authenticate = async (req, res, next) => {
  let jwtToken;
  let authHeader = req.headers["authorization"];
  jwtToken = authHeader.split(" ")[1];
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "SECRET", async (err, payload) => {
      if (err) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  } else {
    res.status(401);
    res.send("Invalid JWT Token");
  }
};

// API 3
app.get("/user/tweets/feed/", authenticate, async (req, res) => {
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  result = await db.all(query);
  query = `SELECT username, tweet,date_time AS dateTime FROM tweet LEFT JOIN
   user ON tweet.user_id = user.user_id WHERE user.user_id<>-1`;
  result.map((obj) => {
    query += ` OR user.user_id=${obj.following_user_id}`;
  });
  query += ` ORDER BY date_time DESC LIMIT 4 OFFSET 0`;
  result = await db.all(query);
  res.send(result);
});

// API 4
app.get("/user/following", authenticate, async (req, res) => {
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  result = await db.all(query);
  query = `SELECT username FROM user WHERE user_id<>-1`;
  result.map((obj) => {
    query += ` OR user_id=${obj.following_user_id}`;
  });
  result = await db.all(query);
  res.send(result);
});

// API 5
app.get("/user/followers", authenticate, async (req, res) => {
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT follower_user_id FROM follower WHERE following_user_id=${user_id}`;
  result = await db.all(query);
  query = `SELECT username FROM user WHERE user_id<>-1`;
  result.map((obj) => {
    query += ` OR user_id=${obj.follower_user_id}`;
  });
  result = await db.all(query);
  res.send(result);
});

// API 6
app.get("/tweets/:tweetId/", authenticate, async (req, res) => {
  const { tweetId } = req.params;
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  result = await db.all(query);
  query = `SELECT tweet_id FROM tweet  WHERE user_id<>-1`;
  result.map((obj) => {
    query += ` OR user_id=${obj.following_user_id}`;
  });

  result = await db.all(query);
  let is_there = result.some((obj) => {
    return obj.tweet_id == tweetId;
  });
  if (!is_there) {
    res.status(400);
    res.send("Invalid Request");
  } else {
    query = `SELECT tweet, coalesce(COUNT(DISTINCT like_id),0) AS likes, coalesce(COUNT(DISTINCT reply_id),0) AS replies, date_time AS dateTime FROM tweet 
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id 
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id 
      WHERE tweet.tweet_id=${tweetId} GROUP BY tweet.tweet_id`;
    result = await db.get(query);
    res.send(result);
  }
});

// API 7
app.get("/tweets/:tweetId/likes/", authenticate, async (req, res) => {
  let tweetId = req.params.tweetId;
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  result = await db.all(query);
  query = `SELECT tweet_id FROM tweet  WHERE user_id<>-1`;
  result.map((obj) => {
    query += ` OR user_id=${obj.following_user_id}`;
  });

  result = await db.all(query);
  //   console.log(result);
  let is_there = result.some((obj) => {
    return obj.tweet_id == tweetId;
  });
  //   console.log(is_there);
  if (!is_there) {
    res.status(400);
    res.send("Invalid Request");
  } else {
    query = `SELECT DISTINCT username,like_id FROM like
      LEFT JOIN user ON like.user_id = user.user_id 
      WHERE like.tweet_id=${tweetId}`;
    result = await db.all(query);
    let des_arr = result.map((obj) => {
      return obj.username;
    });
    res.send({ likes: des_arr });
  }
});

// API 8
app.get("/tweets/:tweetId/replies/", authenticate, async (req, res) => {
  let tweetId = req.params.tweetId;
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  result = await db.all(query);
  query = `SELECT tweet_id FROM tweet  WHERE user_id<>-1`;
  result.map((obj) => {
    query += ` OR user_id=${obj.following_user_id}`;
  });

  result = await db.all(query);
  //   console.log(result);
  let is_there = result.some((obj) => {
    return obj.tweet_id == tweetId;
  });
  //   console.log(is_there);
  if (!is_there) {
    res.status(400);
    res.send("Invalid Request");
  } else {
    query = `SELECT DISTINCT username as name,reply FROM reply
      LEFT JOIN user ON reply.user_id = user.user_id 
      WHERE reply.tweet_id=${tweetId}`;
    result = await db.all(query);
    // let des_arr = result.map((obj) => {
    //   return obj.username;
    // });
    res.send({ replies: result });
  }
});

// API 9
app.get("/user/tweets/", authenticate, async (req, res) => {
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT tweet, coalesce(COUNT(DISTINCT like_id),0) AS likes, coalesce(COUNT(DISTINCT reply_id),0) AS replies, date_time AS dateTime FROM user 
      LEFT JOIN reply ON user.user_id = reply.user_id 
      LEFT JOIN like ON user.user_id = like.user_id 
      LEFT JOIN tweet ON user.user_id = tweet.user_id
      WHERE user.user_id=${user_id} GROUP BY tweet`;
  result = await db.all(query);
  res.send(result);
});

// API 10
app.post("/user/tweets/", authenticate, async (req, res) => {
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  const { tweet } = req.body;
  const myDate = format(new Date(), "yyyy-MM-dd HH-MM-SS").toString();
  query = `INSERT INTO tweet(tweet, user_id, date_time)
    VALUES('${tweet}', '${user_id}', '${myDate}')`;
  await db.run(query);
  res.send("Created a Tweet");
});

// API 11
app.delete("/tweets/:tweetId/", authenticate, async (req, res) => {
  const { tweetId } = req.params;
  let query = `SELECT user_id FROM user WHERE username = '${req.username}'`;
  let result = await db.get(query);
  let user_id = result.user_id;
  query = `SELECT  tweet_id FROM tweet WHERE user_id=${user_id}`;
  result = await db.all(query);
  let is_its_user = result.some((obj) => {
    return obj.tweet_id == tweetId;
  });
  if (is_its_user) {
    query = `DELETE FROM tweet where tweet_id=${tweetID}`;
    result = await db.run(query);
    res.send("Tweet Removed");
  } else {
    res.status(400);
    res.send("Invalid Request");
  }
});

app.listen(3000);
module.exports = app;
