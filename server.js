const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const app = express();
const { ObjectId } = require('mongodb');
const PORT = process.env.PORT | 5002;
const bodyParser = require('body-parser');
const bcrypt = require("bcryptjs");
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let clients = [];

wss.on('connection', function connection(ws) {
  // Add the new client to the list of clients
  clients.push(ws);

  // Log if it's a new client
  console.log('Client connected. Total clients:', clients.length);

  ws.on('close', function () {
    // Remove the disconnected client from the list of clients
    clients = clients.filter(client => client !== ws);

    // Log if it was the last client
    console.log('Client disconnected. Total clients:', clients.length);
  });

  // Handle messages from clients (if needed)
  ws.on('message', function incoming(message) {
    // Handle incoming messages if required
  });
});

// Use this function to broadcast 'cartUpdated' message to all clients
function broadcastCartUpdated() {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send('cartUpdated');
    }
  });
}

// Use this function to broadcast 'favoritesUpdated' message to all clients
function broadcastFavoritesUpdated() {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send('favoritesUpdated');
    }
  });
}

app.use(bodyParser.json({ limit: '50mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));


app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send(process.env.MONGO_URI);
});


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDb connected"))
  .catch((error) => console.log(error));

app.listen(PORT, () => console.log(`listening at ${PORT}`));


// Middleware to refresh JWT token before expiration
const refreshAuthToken = (req, res, next) => {

  const authorizationHeader = req.headers.authorization;


  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Bearer token not provided" });
  }

  const token = authorizationHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {

      if (err.name === 'TokenExpiredError') {
        const newToken = generateToken(decoded.userId);
        res.setHeader('Authorization', `Bearer ${newToken}`);
      } else {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      }
    } else {

      req.userId = decoded.userId;
    }
    next();
  });
};

// app.use(refreshAuthToken);




// Middleware to authenticate user with JWT token
const authenticateUser = (req, res, next) => {
  // Get token from request headers
  const authorizationHeader = req.headers.authorization;

  // Check if authorization header is provided
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Bearer token not provided" });
  }

  // Extract token from authorization header
  const token = authorizationHeader.split(' ')[1];

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
    // If token is valid, attach decoded data to request object
    req.userId = decoded.userId;
    next(); // Proceed to the next middleware or route handler
  });
};


// Function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};




require("./ownerDetails");
const Ownerr = mongoose.model("OwnerInfo");


app.post("/login-owner", async (req, res) => {
  const { email, password } = req.body;
  try {
    const owner = await Ownerr.findOne({ email });
    if (!owner) {
      return res.json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, owner.password);
    if (!isPasswordValid) {
      return res.json({ error: "Invalid password" });
    }

    // Find the restaurant with the restaurant name of the owner
    const restaurant = await Restaurant.findOne({ restaurantName: owner.firstname });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const token = generateToken(owner._id);

    return res.json({ status: "ok", id: owner._id, token, resName: owner.firstname, restaurantId: restaurant._id, name: owner.firstname + " " + owner.lastname });
  } catch (e) {
    return res.json({ status: e.message });
  }
});



// Get owner by ID
app.get("/owner/:id", authenticateUser, async (req, res) => {
  const ownerId = req.params.id;
  try {
    const owner = await Ownerr.findById(ownerId);
    if (!owner) {
      return res.status(404).json({ error: "Owner not found" });
    }
    // If owner found, return owner details
    return res.json({ id: owner._id });
  } catch (error) {
    // Handle errors
    return res.status(500).json({ error: error.message });
  }
});


//client
require("./clientDetails");
const Clientt = mongoose.model("ClientInfo");

////////////////////////  signup
app.post("/register-client", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  const encryptedPassword = await bcrypt.hash(password, 10);
  try {
    const oldClient = await Clientt.findOne({ email });
    if (oldClient) {
      return res.send({
        error: "User with the same Email address already exists",
      });
    }

    const newClient = await Clientt.create({
      firstname,
      lastname,
      email,
      password: encryptedPassword,
    });

    // Generate JWT token for the newly registered client
    const token = generateToken(newClient._id);

    return res.send({ status: "ok", token });
  } catch (e) {
    return res.send({ status: e.message });
  }
});

//login for the res owner

app.post("/login-client", async (req, res) => {
  const { email, password } = req.body;
  try {
    const client = await Clientt.findOne({ email });
    if (!client) {
      return res.status(404).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, client.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate JWT token
    const token = generateToken(client._id);

    // Send token in response
    return res.status(200).json({ status: "ok", token, userId: client._id, name: client.firstname + " " + client.lastname });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});



//admin processing
app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    const token = generateToken(process.env.ADMIN_EMAIL);
    return res.json({ status: "ok", message: "Admin authenticated successfully", token });
  } else {
    return res.status(401).json({ error: "Invalid credentials" });
  }
});



// Define middleware function to check admin authentication
const authenticateAdmin = (req, res, next) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    return res.status(401).json({ error: "Unauthorized: Admin credentials required" });
  }
};

// heeere wee generate a random password
const generateRandomPassword = () => {
  // Generate a random string of 8 characters
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return password;
};

// const Dish = mongoose.model("DishInfo");
// const MenuCategory = mongoose.model("MenuCategory");

// Middleware to add restaurant owner after adding a restaurant
const addRestaurantOwner = async (req, res, next) => {
  const { restaurantName } = req.body;

  try {
    const password = generateRandomPassword();

    const email = `${restaurantName.replace(/\s+/g, '')}@delivery.com`;

    const encryptedPassword = await bcrypt.hash(password, 10);

    // Create admin user for the restaurant
    const owner = new Ownerr({
      firstname: restaurantName, // You can use restaurant name as owner's firstname
      lastname: "Owner",
      email,
      password: encryptedPassword,
    });

    await owner.save();

    req.generatedEmail = email;
    req.generatedPassword = password;

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const favoriteSchema = new mongoose.Schema({
  restaurantName: {
    type: String,
    required: true
  },
  customerId: {
    type: String,
    required: true
  }
});

const Favorite = mongoose.model("Favorite", favoriteSchema);

module.exports = Favorite;



// Create Restaurant model
// const Restaurant = mongoose.model("Restaurant", RestaurantSchema);

// Route to add a restaurant
// app.post("/add-restaurant", addRestaurantOwner, async (req, res) => {
//   const { restaurantName, base64Image, location, menu } = req.body;
//   console.log(req.body.menu[0].dishes[0]);
//   try {
//     const existingRestaurant = await Restaurant.findOne({ restaurantName });
//     if (existingRestaurant) {
//       return res.status(400).json({ error: "Restaurant with the same name already exists" });
//     }

//     // Construct menu categories with dishes
//     const menuCategories = await Promise.all(menu && menu.map(async category => {
//       const dishes = await Promise.all(category.dishes && category.dishes.map(async dishData => {
//         const dishOptionalExtras = dishData.optionalExtras && dishData.optionalExtras.map(optionalExtra => ({
//           name: optionalExtra.name,
//           price: optionalExtra.price
//         }));
//         const dishRequiredExtras = dishData.requiredExtras && dishData.requiredExtras.map(requiredExtra => ({
//           name: requiredExtra.name,
//           price: requiredExtra.price
//         }));

//         const dish = new Dish({
//           name: dishData.name,
//           price: dishData.price,
//           dishImage: dishData.dishImage,
//           description: dishData.description,
//           optionalExtras: dishOptionalExtras,
//           requiredExtras: dishRequiredExtras // Add requiredExtras field
//         });

//         await dish.save();
//         return dish;
//       }));

//       const menuCategory = new MenuCategory({
//         categoryName: category.categoryName,
//         dishes: dishes
//       });
//       await menuCategory.save();

//       return menuCategory;
//     }));

//     // Create a new restaurant instance
// const newRestaurant = new Restaurant({
//   restaurantName,
//   picture: base64Image,
//   location,
//   menu: menuCategories,
//   generatedEmail: req.generatedEmail,
//   generatedPassword: req.generatedPassword
// });

// // Save the new restaurant to the database
// await newRestaurant.save();

//     return res.status(201).json({
//       status: "ok",
//       message: "Restaurant added successfully",
// generatedEmail: req.generatedEmail,
// generatedPassword: req.generatedPassword
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// Define Dish Schema
const DishSchema = new mongoose.Schema({
  name: String,
  price: Number,
  dishImage: String,
  description: String,
  extras: {
    requiredExtras: [{
      name: String,
      price: Number,
    }],
    optionalExtras: [{
      name: String,
      price: Number
    }]
  }
});


// Define Menu Category Schema
// Define Menu Category Schema
const MenuCategorySchema = new mongoose.Schema({
  categoryName: String,
  dishes: [{
    name: String,
    price: Number,
    dishImage: String,
    description: String,
    extras: {
      requiredExtras: [{
        name: String,
        price: Number
      }],
      optionalExtras: [{
        name: String,
        price: Number
      }]
    }
  }]
});





// Define Restaurant Schema
const RestaurantsSchema = new mongoose.Schema({
  restaurantName: { type: String, required: true },

  picture: { type: String, required: true },
  location: { type: String, required: true },
  menu: [MenuCategorySchema],
  generatedEmail: { type: String, required: true },
  generatedPassword: { type: String, required: true }
}, {
  collection: "restaurantInfo"
});

const Restaurant = mongoose.model("RestaurantInfo", RestaurantsSchema);


// Create Dish model
const Dish = mongoose.model("Dish", DishSchema);

// Create Menu Category model
// const MenuCategory = mongoose.model("MenuCategory"\, MenuCategorySchema);
const MenuCategory = mongoose.model("MenuCategory", MenuCategorySchema);

app.post("/add-restaurant", addRestaurantOwner, async (req, res) => {
  const { restaurantName, base64Image, location, menu } = req.body;

  try {
    const existingRestaurant = await Restaurant.findOne({ restaurantName });
    if (existingRestaurant) {
      return res.status(400).json({ error: "Restaurant with the same name already exists" });
    }

    const menuCategories = await Promise.all(menu && menu.map(async categoryData => {
      const dishes = await Promise.all(categoryData.dishes.map(async dishData => {
        const dish = new Dish({
          name: dishData.name,
          price: dishData.price,
          dishImage: dishData.dishImage,
          description: dishData.description,
          extras: {
            requiredExtras: dishData.requiredExtras,
            optionalExtras: dishData.optionalExtras
          }
        });

        await dish.save();
        return dish;
      }));

      console.log("Dishes", dishes)

      const menuCategory = new MenuCategory({
        categoryName: categoryData.categoryName,
        dishes
      });

      await menuCategory.save();
      return menuCategory;
    }));

    const newRestaurant = new Restaurant({
      restaurantName,
      picture: base64Image,
      location,
      menu: menuCategories,
      generatedEmail: req.generatedEmail,
      generatedPassword: req.generatedPassword
    });

    // Save the new restaurant to the database
    await newRestaurant.save();

    return res.status(201).json({
      status: "ok",
      message: "Restaurant added successfully",
      generatedEmail: req.generatedEmail,
      generatedPassword: req.generatedPassword
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});




app.post("/add-to-favorites/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { restaurantName } = req.body;
    const existingFavorite = await Favorite.findOne({ restaurantName, customerId });
    if (existingFavorite) {
      return res.status(400).json({ error: "Restaurant already in favorites" });
    }
    const favorite = new Favorite({ customerId, restaurantName });
    await favorite.save();
    broadcastFavoritesUpdated();

    res.status(201).send(favorite);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/favorites/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const favorites = await Favorite.find({ customerId });
    res.send(favorites);
  } catch (error) {
    res.status(500).send(error.message);
  }
});


app.delete("/remove-from-favorites/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { restaurantName } = req.body;
    await Favorite.findOneAndDelete({ customerId, restaurantName }); // Use an object to specify the query
    res.send({ message: "Favorite removed successfully" });
  } catch (error) {
    res.status(500).send(error.message);
  }
});





//update restaurant
// Route to update a restaurant
app.put("/update-restaurant/:resName", async (req, res) => {
  const { resName } = req.params;
  const { newRestaurantName, newBase64Image, newLocation, newMenu } = req.body;

  try {
    // Find the restaurant by name
    let restaurant = await Restaurant.findOne({ restaurantName: resName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // Update the restaurant details
    if (newRestaurantName) {
      restaurant.restaurantName = newRestaurantName;

      // Update the owner's firstname with the new restaurant name
      const owner = await Ownerr.findOneAndUpdate(
        { firstname: resName }, // Query to find the owner by the current restaurant name
        { firstname: newRestaurantName }, // Update the owner's firstname with the new restaurant name
        { new: true } // To return the updated document
      );
    }
    if (newBase64Image) {
      restaurant.picture = newBase64Image;
    }
    if (newLocation) {
      restaurant.location = newLocation;
    }
    if (newMenu) {
      // Clear existing menu categories and dishes
      restaurant.menu = [];

      // Construct new menu categories with dishes
      const menuCategories = await Promise.all(newMenu.map(async category => {
        const dishes = await Promise.all(category.dishes.map(async dishData => {
          const dishExtras = dishData.extras && dishData.extras.map(extra => ({
            name: extra.name,
            price: extra.price
          }));

          const dish = new Dish({
            name: dishData.name,
            price: dishData.price,
            dishImage: dishData.dishImage,
            description: dishData.description,
            extras: dishExtras
          });

          await dish.save();
          return dish;
        }));

        const menuCategory = new MenuCategory({
          categoryName: category.categoryName,
          dishes: dishes
        });
        await menuCategory.save();

        return menuCategory;
      }));

      restaurant.menu = menuCategories;
    }

    // Save the updated restaurant
    await restaurant.save();

    return res.status(200).json({ status: "ok", message: "Restaurant updated successfully", resName: newRestaurantName, name: newRestaurantName + " " + "Owner" });
  } catch (error) {
    console.error("Error updating restaurant:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/update-dish/:resName/:categoryName/:dishId", authenticateUser, refreshAuthToken, async (req, res) => {
  const { resName, categoryName, dishId } = req.params;
  const { name, price, description, dishImage } = req.body;

  try {
    // Find the restaurant by name
    let restaurant = await Restaurant.findOne({ restaurantName: resName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // Find the menu category by category name
    let category = restaurant.menu.find((cat) => cat.categoryName === categoryName);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Find the dish in the category's dishes array by dish id
    let dish = category.dishes.id(dishId);
    if (!dish) {
      return res.status(404).json({ error: "Dish not found" });
    }

    // Update the dish details
    if (name) {
      dish.name = name;
    }
    if (price) {
      dish.price = price;
    }
    if (description) {
      dish.description = description;
    }
    if (dishImage) {
      dish.dishImage = dishImage;
    }

    // Save the updated restaurant
    await restaurant.save();

    return res.status(200).json({ status: "ok", message: "Dish updated successfully", data: dish });
  } catch (error) {
    console.error("Error updating dish:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

});

app.delete("/delete-dish/:resName/:categoryName/:dishId", async (req, res) => {
  const { resName, categoryName, dishId } = req.params;

  try {
    // Find the restaurant by name
    let restaurant = await Restaurant.findOne({ restaurantName: resName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // Find the category by name
    let category = restaurant.menu.find((cat) => cat.categoryName === categoryName);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Find the dish index in the category's dishes array
    let dishIndex = category.dishes.findIndex((d) => d._id.toString() === dishId);
    if (dishIndex === -1) {
      return res.status(404).json({ error: "Dish not found" });
    }

    // Delete the dish from the category's dishes array
    category.dishes.splice(dishIndex, 1);

    // Save the updated restaurant
    await restaurant.save();

    return res.status(200).json({ status: "ok", message: "Dish deleted successfully" });
  } catch (error) {
    console.error("Error deleting dish:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

});







// delete restaurant
// Route to delete a restaurant by name
// app.delete("/delete-restaurant/:resName", async (req, res) => {
//   const { resName } = req.params;

//   try {
//     // Find the restaurant by name
//     const restaurant = await Restaurant.findOne({ restaurantName: resName });
//     if (!restaurant) {
//       return res.status(404).json({ error: "Restaurant not found" });
//     }

//     // Delete the restaurant
//     await restaurant.remove();

//     // If you have any additional cleanup or cascade delete operations, you can perform them here

//     return res.status(200).json({ status: "ok", message: "Restaurant deleted successfully" });
//   } catch (error) {
//     console.error("Error deleting restaurant:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });


app.delete("/delete-restaurant/:resName", async (req, res) => {
  const { resName } = req.params;

  try {
    // Find the restaurant by name
    const restaurant = await Restaurant.findOne({ restaurantName: resName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // Find the owner by restaurant name and delete the owner
    await Ownerr.deleteOne({ firstname: resName });

    // Delete the restaurant
    await Restaurant.deleteOne({ restaurantName: resName });

    // If you have any additional cleanup or cascade delete operations, you can perform them here

    return res.status(200).json({ status: "ok", message: "Restaurant deleted successfully" });
  } catch (error) {
    console.error("Error deleting restaurant:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});



app.get("/get-one-res/:resName", authenticateUser, refreshAuthToken, async (req, res) => {
  const { resName } = req.params;
  console.log("Received resName:", resName); // Log the received resName
  try {
    const restaurant = await Restaurant.findOne({ restaurantName: resName });
    if (!restaurant) {
      return res.status(404).json({ status: "error", message: "Restaurant not found" });
    }
    res.status(200).json({ status: "ok", data: restaurant });
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});


app.get("/get-restaurants", authenticateUser, refreshAuthToken, async (req, res) => {
  try {
    const restaurants = await Restaurant.find();
    return res.status(200).json({ status: "ok", data: restaurants });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "An error occurred while getting restaurants" });
  }
});

// const CartSchema = new mongoose.Schema({
//   customerId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Customer',
//     required: true
//   },
//   products: [{
//     productId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Product',
//       required: true
//     },
//     quantity: {
//       type: Number,
//       required: true
//     },
//     name: {
//       type: String,
//       required: true
//     },
//     price: {
//       type: Number,
//       required: true
//     }
//   }],
// });
// const Cart = mongoose.model("Cart", CartSchema);
// app.post("/add-to-cart/:customerId", async (req, res) => {
//   const { productId, quantity, name, description, price } = req.body;
//   const { customerId } = req.params;

//   try {
//     let cart = await Cart.findOne({ customerId });
//     if (!cart) {
//       cart = new Cart({ customerId, products: [] });
//     }

//     const existingProductIndex = cart.products.findIndex(product => product.productId.toString() === productId);
//     if (existingProductIndex !== -1) {
//       // If product exists, update its quantity
//       cart.products[existingProductIndex].quantity += quantity;
//     } else {
//       // If product does not exist, add it with given quantity, name, description, and price
//       cart.products.push({ productId, quantity, name, description, price });
//     }

//     await cart.save();

//     res.status(200).json({ status: "ok", message: "Product added to cart", id: cart.customerId, products: cart.products });
//   } catch (error) {
//     console.error("Error adding product to cart:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

const CartSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    extras: {
      type: [{
        name: String,
        price: Number
      }],
      default: []
    }
  }],
});
const Cart = mongoose.model("Cart", CartSchema);

app.post("/add-to-cart/:customerId", async (req, res) => {
  const { productId, quantity, name, description, price, extras } = req.body;
  const { customerId } = req.params;

  try {
    let cart = await Cart.findOne({ customerId });
    if (!cart) {
      cart = new Cart({ customerId, products: [] });
    }

    const existingProductIndex = cart.products.findIndex(product => product.productId.toString() === productId);
    if (existingProductIndex !== -1) {
      // If product exists, update its quantity
      cart.products[existingProductIndex].quantity += quantity;
    } else {
      // If product does not exist, add it with given quantity, name, description, price, and extras
      cart.products.push({ productId, quantity, name, description, price, extras });
    }

    await cart.save();

    broadcastCartUpdated();


    res.status(200).json({ status: "ok", message: "Product added to cart", id: cart.customerId, products: cart.products });
  } catch (error) {
    console.error("Error adding product to cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




///clear
// authenticateUser, refreshAuthToken
app.delete("/clear-cart/:customerId", async (req, res) => {
  const { customerId } = req.params;
  try {
    let cart = await Cart.findOne({ customerId });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    // Clear all products from the cart
    cart.products = [];

    await cart.save();

    res.status(200).json({ status: "ok", message: "Cart cleared successfully" });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// delete from cart
app.delete("/remove-from-cart/:productId/:customerId", async (req, res) => {
  const { productId, customerId } = req.params;

  try {
    let cart = await Cart.findOne({ customerId });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const productIndex = cart.products.findIndex(product => product.productId.toString() === productId);
    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found in the cart" });
    }

    cart.products.splice(productIndex, 1);

    await cart.save();

    res.status(200).json({ status: "ok", message: "Product removed from cart", id: cart.customerId, products: cart.products });
  } catch (error) {
    console.error("Error removing product from cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// app.get("/get-cart/:customerId", async (req, res) => {
//   const { customerId } = req.params;

//   // const customerId = req.customerId; // Assuming you pass the customerId as a query parameter

//   try {
//     const cart = await Cart.findOne({ customerId });
//     if (!cart) {
//       return res.status(404).json({ error: "Cart not found" });
//     }
//     const totalItemsCount = cart.products.reduce((acc, product) => acc + product.quantity, 0);

//     res.status(200).json({ cart, totalItemsCount });
//   } catch (error) {
//     console.error("Error fetching cart:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

app.get("/get-cart/:customerId", async (req, res) => {
  const { customerId } = req.params;

  try {
    const cart = await Cart.findOne({ customerId });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const totalItemsCount = cart.products.reduce((acc, product) => acc + product.quantity, 0);

    // Send WebSocket message to notify clients of cart update
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send('cartUpdated');
      }
    });

    res.status(200).json({ cart, totalItemsCount });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



//get dish by its id
//get dish by its id
// Endpoint to get a dish by its ID
app.get("/dishes/:dishId", async (req, res) => {
  const { dishId } = req.params;

  try {
    // Find the dish by its ID
    const dish = await Dish.findById(dishId);

    if (!dish) {
      return res.status(404).json({ error: "Dish not found" });
    }

    return res.status(200).json({ status: "ok", data: dish });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", message: "An error occurred while fetching the dish" });
  }
});
// orders proccessing
// Define Order Schema
// Define Order Schema
const OrderSchema = new mongoose.Schema({
  orderId: String,
  restaurantId: String, // Added restaurantId field
  resName: String,
  customerId: String,
  products: [{
    productId: String,
    quantity: Number,
    price: Number,
    name: String,
    extras: {
      type: [{
        name: String,
        price: Number
      }],
      default: []
    }
  }],
  status: String,
  shippingInfo: {
    name: String,
    email: String,
    address: String,
    phoneNumber1: String,
    phoneNumber2: String
  },
  preparingTime: Number, // in minutes
  preparingStartedAt: Date,
  createdAt: { type: Date, default: Date.now },
  orderTime: Date,
  completedAt: Date,
  declinedAt: Date
});

OrderSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next();
  }
  this.orderTime = new Date();
  next();
});

OrderSchema.statics.updateOrderStatus = async function (orderId, newStatus) {
  try {
    const order = await this.findOneAndUpdate({ orderId }, { status: newStatus }, { new: true });
    if (!order) {
      throw new Error('Order not found');
    }
    return { message: 'Order status updated successfully' };
  } catch (error) {
    throw error;
  }
};

OrderSchema.statics.checkOrderStatus = async function (orderId) {
  try {
    const order = await this.findOne({ orderId });
    if (!order) {
      throw new Error('Order not found');
    }
    return { orderId: order.orderId, status: order.status };
  } catch (error) {
    throw error;
  }
};

// Create Order model
const Order = mongoose.model("Order", OrderSchema);


// Endpoint to create an order

app.post("/create-order/:customerId", async (req, res) => {
  const { customerId } = req.params;

  try {
    const { products, status, shippingInfo, resName } = req.body;
    const orderId = generateRandomOrderId(); // Generate a random orderId
    const order = new Order({
      orderId: orderId,
      resName: resName,
      customerId: customerId,
      products: products,
      status: status,
      shippingInfo: shippingInfo,
      createdAt: new Date(), // Set createdAt field to current date and time
      orderTime: new Date() // Set orderTime field to current date and time
    });

    await order.save();

    await Cart.deleteOne({ customerId: customerId });

    return res.status(201).json({ status: "ok", message: "Order created successfully", order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

function generateRandomOrderId() {
  const timestamp = Date.now().toString(36);
  const randomString = Math.random().toString(36).substr(2, 5);
  return timestamp + randomString;
}


// Endpoint to get all orders
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find();
    return res.status(200).json({ status: "ok", orders });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

//get owner orders of his restaurant
// Endpoint to get orders by resName
app.get("/orders/:resName", async (req, res) => {
  const { resName } = req.params;

  try {
    const orders = await Order.find({ resName });
    if (orders.length === 0) {
      return res.status(404).json({ status: "error", message: "No orders found for the specified restaurant name" });
    }
    return res.status(200).json({ status: "ok", orders });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


// Endpoint to get orders by customer ID
// Assuming you have a route for getting orders
app.get('/order/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const orders = await Order.find({ customerId });

    // Add orderTime field to each order object
    const ordersWithTime = orders.map(order => ({
      ...order.toJSON(),
      orderTime: order.createdAt // Assuming createdAt is the timestamp of when the order was created
    }));

    res.json({ orders: ordersWithTime });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Endpoint to update an order status
// app.put("/orders/:orderId", async (req, res) => {
//   const { orderId } = req.params;
//   const { status } = req.body;
//   try {
//     await Order.findOneAndUpdate({ orderId }, { status });
//     return res.status(200).json({ status: "ok", message: "Order status updated successfully" });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

app.put("/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const { status, preparingTime } = req.body; // Add preparingTime to the request body
  try {
    let updateData = { status };
    // If the status is "Preparing," update the preparingTime and set preparingStartedAt
    if (status === "Preparing" && preparingTime) {
      updateData.preparingTime = preparingTime;
      updateData.preparingStartedAt = new Date(); // Set preparingStartedAt to the current date/time
    }
    if (status === "Completed") {
      updateData.completedAt = new Date(); // Set preparingStartedAt to the current date/time
    }
    if (status === "Not Approved") {
      updateData.declinedAt = new Date(); // Set preparingStartedAt to the current date/time
    }
    await Order.findOneAndUpdate({ orderId }, updateData);
    return res.status(200).json({ status: "ok", message: "Order status updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});



// Endpoint to delete an order
app.delete("/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  try {
    await Order.findOneAndDelete({ orderId });
    return res.status(200).json({ status: "ok", message: "Order deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
//categories
app.get("/restaurant-categories/:restaurantName", async (req, res) => {
  const { restaurantName } = req.params;
  try {
    const restaurant = await Restaurant.findOne({ restaurantName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const categories = restaurant.menu.map(category => category.categoryName);

    return res.status(200).json({ status: "ok", categories });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

//products in specific category
// Endpoint to get products of a specific category in a specific restaurant
app.get("/restaurant/:restaurantName/category/:categoryName/dishes", async (req, res) => {
  const { restaurantName, categoryName } = req.params;
  try {
    const restaurant = await Restaurant.findOne({ restaurantName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const category = restaurant.menu.find(category => category.categoryName === categoryName);
    if (!category) {
      return res.status(404).json({ error: "Category not found in the specified restaurant" });
    }

    const products = category.dishes; // Assuming dishes are the products
    console.log(category)

    return res.status(200).json({ status: "ok", products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});




// Endpoint to add a dish to a specific category in a specific restaurant
app.post("/restaurant/:restaurantName/category/:categoryName/add-dish", async (req, res) => {
  const { restaurantName, categoryName } = req.params;
  const { name, price, dishImage, description } = req.body;

  try {
    const restaurant = await Restaurant.findOne({ restaurantName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const categoryIndex = restaurant.menu.findIndex(category => category.categoryName === categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: "Category not found in the specified restaurant" });
    }

    const newDish = {
      name,
      price,
      dishImage,
      description
    };

    restaurant.menu[categoryIndex].dishes.push(newDish);
    await restaurant.save();

    return res.status(201).json({ status: "ok", message: "Dish added successfully", dish: newDish });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to delete a dish from a specific category in a specific restaurant
app.delete("/restaurant/:restaurantName/category/:categoryName/delete-dish/:dishId", async (req, res) => {
  const { restaurantName, categoryName, dishId } = req.params;

  try {
    const restaurant = await Restaurant.findOne({ restaurantName });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const categoryIndex = restaurant.menu.findIndex(category => category.categoryName === categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: "Category not found in the specified restaurant" });
    }

    const dishIndex = restaurant.menu[categoryIndex].dishes.findIndex(dish => dish._id.toString() === dishId);
    if (dishIndex === -1) {
      return res.status(404).json({ error: "Dish not found in the specified category" });
    }

    // Remove the dish from the category
    restaurant.menu[categoryIndex].dishes.splice(dishIndex, 1);
    await restaurant.save();

    return res.status(200).json({ status: "ok", message: "Dish deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


// API for restaurant owner to update order status
app.post('/update-order-status', async (req, res) => {
  const { orderId, newStatus } = req.body;
  try {
    const response = await Order.updateOrderStatus(orderId, newStatus);
    res.json(response);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});


app.get('/check-order-status/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const response = await Order.checkOrderStatus(orderId);
    res.json(response);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});



const extrasSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  }
});

// Create the Extras model
const Extras = mongoose.model('Extras', extrasSchema);



app.post('/add-required-extras/:dishId', async (req, res) => {
  const { name, price } = req.body;
  const dishId = req.params.dishId;
  try {
    const dish = await Dish.findById(dishId);
    if (!dish) {
      return res.status(404).json({ error: 'Dish not found' });
    }
    const newExtra = await Extras.create({ name, price });
    dish.requiredExtras.push(newExtra);
    await dish.save();
    res.json({ message: 'Required extra added successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// API to add optional extras to a dish
app.post('/add-optional-extras/:dishId', async (req, res) => {
  const { name, price } = req.body;
  const dishId = req.params.dishId;
  try {
    const dish = await Dish.findById(dishId);
    if (!dish) {
      return res.status(404).json({ error: 'Dish not found' });
    }
    const newExtra = await Extras.create({ name, price });
    dish.optionalExtras.push(newExtra);
    await dish.save();
    res.json({ message: 'Optional extra added successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});





// API to get extras offered with a meal
app.get('/get-extras/:dishId', async (req, res) => {
  const dishId = req.params.dishId;
  try {
    const dish = await Dish.findById(dishId).populate('requiredExtras optionalExtras');
    if (!dish) {
      return res.status(404).json({ error: 'Dish not found' });
    }
    res.json({ requiredExtras: dish.requiredExtras, optionalExtras: dish.optionalExtras });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// API to buy extras with a meal
app.post('/buy-extras/:dishId', async (req, res) => {
  const { extras } = req.body;
  const dishId = req.params.dishId;
  try {
    const dish = await Dish.findById(dishId).populate('requiredExtras optionalExtras');
    if (!dish) {
      return res.status(404).json({ error: 'Dish not found' });
    }
    // Calculate the total price including selected extras
    let totalPrice = dish.price;
    extras.forEach(extraId => {
      const extra = dish.requiredExtras.find(extra => extra._id.equals(extraId)) || dish.optionalExtras.find(extra => extra._id.equals(extraId));
      if (extra) {
        totalPrice += extra.price || 0;
      }
    });
    // Return the total price
    res.json({ totalPrice });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


const moment = require('moment');
app.post('/api/orders/completed', async (req, res) => {
  try {
    const { period, restaurantName } = req.body;
    let startDate, endDate;

    switch (period) {
      case 'today':
        startDate = moment().startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
        break;
      case 'yesterday':
        startDate = moment().subtract(1, 'days').startOf('day').toDate();
        endDate = moment().subtract(1, 'days').endOf('day').toDate();
        break;
      case 'lastWeek':
        startDate = moment().subtract(1, 'weeks').startOf('week').toDate();
        endDate = moment().subtract(1, 'weeks').endOf('week').toDate();
        break;
      case 'lastMonth':
        startDate = moment().subtract(1, 'months').startOf('month').toDate();
        endDate = moment().subtract(1, 'months').endOf('month').toDate();
        break;
      case 'lastTwoMonths':
        startDate = moment().subtract(2, 'months').startOf('month').toDate();
        endDate = moment().subtract(1, 'months').endOf('month').toDate();
        break;
      default:
        throw new Error('Invalid period');
    }

    const query = {
      status: 'Completed',
      completedAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (restaurantName) {
      query.resName = restaurantName;
    }

    const filteredOrders = await Order.find(query);

    res.json(filteredOrders);
  } catch (err) {
    console.error('Error retrieving completed orders:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/revenue', async (req, res) => {
  try {
    const { period, restaurantName } = req.body;
    let startDate, endDate;

    switch (period) {
      case 'today':
        startDate = moment().startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
        break;
      case 'yesterday':
        startDate = moment().subtract(1, 'days').startOf('day').toDate();
        endDate = moment().subtract(1, 'days').endOf('day').toDate();
        break;
      case 'lastWeek':
        startDate = moment().subtract(1, 'weeks').startOf('week').toDate();
        endDate = moment().subtract(1, 'weeks').endOf('week').toDate();
        break;
      case 'lastMonth':
        startDate = moment().subtract(1, 'months').startOf('month').toDate();
        endDate = moment().subtract(1, 'months').endOf('month').toDate();
        break;
      case 'lastTwoMonths':
        startDate = moment().subtract(2, 'months').startOf('month').toDate();
        endDate = moment().subtract(1, 'months').endOf('month').toDate();
        break;
      default:
        throw new Error('Invalid period');
    }

    const query = {
      status: 'Completed',
      completedAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (restaurantName) {
      query.resName = restaurantName;
    }

    const orders = await Order.find(query);

    if (orders.length === 0) {
      return res.json({ message: 'No completed orders found in this date range' });
    }

    const orderDetails = orders.map(order => {
      const orderTotalPrice = order.products.reduce((total, product) => {
        let totalPrice = product.price * product.quantity;
        if (product.extras && product.extras.length > 0) {
          totalPrice += product.extras.reduce((acc, extra) => acc + extra.price, 0);
        }
        return total + totalPrice;
      }, 0);

      return { orderId: order.orderId, revenue: orderTotalPrice.toFixed(2) };
    });

    const totalRevenue = orderDetails.reduce((total, order) => total + parseFloat(order.revenue), 0).toFixed(2);

    res.json({ orderDetails, totalRevenue });

  } catch (err) {
    console.error('Error calculating total revenue:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.post('/api/orders/rejected', async (req, res) => {
  try {
    const { period, restaurantName } = req.body;
    let startDate, endDate;

    switch (period) {
      case 'today':
        startDate = moment().startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
        break;
      case 'yesterday':
        startDate = moment().subtract(1, 'days').startOf('day').toDate();
        endDate = moment().subtract(1, 'days').endOf('day').toDate();
        break;
      case 'lastWeek':
        startDate = moment().subtract(1, 'weeks').startOf('week').toDate();
        endDate = moment().subtract(1, 'weeks').endOf('week').toDate();
        break;
      case 'lastMonth':
        startDate = moment().subtract(1, 'months').startOf('month').toDate();
        endDate = moment().subtract(1, 'months').endOf('month').toDate();
        break;
      case 'lastTwoMonths':
        startDate = moment().subtract(2, 'months').startOf('month').toDate();
        endDate = moment().subtract(1, 'months').endOf('month').toDate();
        break;
      default:
        throw new Error('Invalid period');
    }

    const query = {
      status: 'Not Approved',
      declinedAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (restaurantName) {
      query.resName = restaurantName;
    }

    const rejectedOrders = await Order.find(query);

    res.json(rejectedOrders);
  } catch (err) {
    console.error('Error retrieving rejected orders:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.use(express.static('build'));