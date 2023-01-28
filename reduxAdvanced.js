//createStore:
function createStore(reducer) {
  let state = reducer(undefined, {});
  let cbs = [];
  const getState = () => state;
  const subscribe = (cb) => (
    cbs.push(cb), () => (cbs = cbs.filter((c) => c !== cb))
  );

  const dispatch = (action) => {
    if (typeof action === "function") {
      return action(dispatch, getState);
    }
    const newState = reducer(state, action);
    if (newState !== state) {
      state = newState;
      for (let cb of cbs) cb(state);
    }
  };

  return {
    getState,
    dispatch,
    subscribe,
  };
}

//jwtDecode:
const jwtDecode = (token) => {
  try {
    let payload = JSON.parse(atob(token.split(".")[1]));
    console.log(payload);
    return payload;
  } catch (e) {
    return undefined;
  }
};

//getGql:
const getGql = (url) => (query, variables) =>
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.authToken
        ? { Authorization: "Bearer " + localStorage.authToken }
        : {}),
    },
    body: JSON.stringify({ query, variables }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.data) {
        return Object.values(data.data)[0];
      } else throw new Error(JSON.stringify(data.errors));
    });

const url = "http://shop-roles.node.ed.asmer.org.ua/";
const gql = getGql(url + "graphql");

//редьюсеры:
//promiseReducer:
function promiseReducer(state = {}, { type, status, payload, error, name }) {
  if (type === "PROMISE") {
    return {
      ...state,
      [name]: { status, payload, error },
    };
  }
  return state;
}

//actionPromise:
const actionPromise = (name, promise) => async (dispatch) => {
  dispatch(actionPending(name));
  try {
    const payload = await promise;
    dispatch(actionFulfilled(name, payload));
    return payload;
  } catch (error) {
    dispatch(actionRejected(name, error));
  }
};

//authReducer:
function authReducer(state = {}, { type, token }) {
  if (type === "AUTH_LOGOUT") {
    window.localStorage.removeItem("authToken");
    return {};
  }
  if (type === "AUTH_LOGIN") {
    try {
      window.localStorage.setItem("authToken", token);
      return {
        token: token,
        payload: jwtDecode(token),
      };
    } catch (e) {}
  }
  return state;
}

//cartReducer:
function cartReducer(state = {}, { type, good, count = 1 }) {
  if (type === "CART_ADD") {
    return {
      ...state,
      [good._id]: {
        good,
        count: +count,
      },
    };
  }

  if (type === "CART_SUB") {
    if (state([good._id].count - count) <= 0) {
      delete state[good._id];
    } else {
      return {
        ...state,
        [good._id]: {
          good,
          count: state[good._id].count - count,
        },
      };
    }
  }

  if (type === "CART_DEL") {
    delete state[good._id];
    return { ...state };
  }

  if (type === "CART_SET") {
    return {
      ...state,
      [good._id]: {
        good,
        count,
      },
    };
  }

  if (type === "CART_CLEAR") {
    state = {};
  }
  return state;
}

//localStoredReducer:
function localStoredReducer(originalReducer, localStorageKey) {
  function wrapper(state, action) {
    if (!state) {
      try {
        return JSON.parse(localStorage[localStorageKey]);
      } catch {}
    }
    let res = originalReducer(state, action);
    localStorage[localStorageKey] = JSON.stringify(res);
    return res;
  }
  return wrapper;
}

//экшены:
//экшены actionPromise:
const actionPending = (name) => ({ type: "PROMISE", status: "PENDING", name });
const actionFulfilled = (name, payload) => ({
  type: "PROMISE",
  status: "FULFILLED",
  name,
  payload,
});
const actionRejected = (name, error) => ({
  type: "PROMISE",
  status: "REJECTED",
  name,
  error,
});

//экшены authReducer:
const actionAuthLogin = (token) => ({ type: "AUTH_LOGIN", token });
const actionAuthLogout = () => ({ type: "AUTH_LOGOUT" });

//экшены cartReducer:
const actionCartAdd = (good, count = 1) => ({ type: "CART_ADD", count, good });
const actionCartSub = (good, count = 1) => ({ type: "CART_SUB", count, good });
const actionCartDel = (good) => ({ type: "CART_DEL", good });
const actionCartSet = (good, count = 1) => ({ type: "CART_SET", count, good });
const actionCartClear = () => ({ type: "CART_CLEAR" });

//combineReducers:
function combineReducers(reducers) {
  function totalReducer(state = {}, action) {
    const newTotalState = {};
    for (const [reducerName, reducer] of Object.entries(reducers)) {
      const newSubState = reducer(state[reducerName], action);
      if (newSubState !== state[reducerName]) {
        newTotalState[reducerName] = newSubState;
      }
    }
    if (Object.keys(newTotalState).length) {
      return { ...state, ...newTotalState };
    }
    return state;
  }
  return totalReducer;
}

const totalReducer = combineReducers({
  promise: promiseReducer,
  auth: localStoredReducer(authReducer, "auth"),
  cart: localStoredReducer(cartReducer, "cart"),
});

const store = createStore(totalReducer);
store.subscribe(() => console.log(store.getState()));

//GraphQL запросы:
//категории:
const actionRootCats = () =>
  actionPromise(
    "rootCats",
    gql(`query rootCats2{
    CategoryFind(query: "[{\\"parent\\": null}]"){
            _id 
            name
        }   
    }`)
  );

store.dispatch(actionRootCats());

//категория:
const oneCatWithGoods = (_id) =>
  actionPromise(
    "oneCatWithGoods",
    gql(
      `query oneCatWithGoods ($q:String) {
      CategoryFindOne (query: $q){
          _id 
          name 
          parent{
            _id 
            name} 
          subCategories {
          _id 
          name
        },
        goods {
          _id 
          name 
          price 
          description
          images {
            url
          }
        }
      }}`,
      { q: JSON.stringify([{ _id }]) }
    )
  );

//товар:
const goodWithDescAndImg = (_id) =>
  actionPromise(
    "goodWithDescAndImg",
    gql(
      `query goodWithDescAndImg ($q:String) {
      GoodFindOne (query: $q){
          _id 
          name
          price
          description 
          images {
            url
          }
    }}`,
      { q: JSON.stringify([{ _id }]) }
    )
  );

//регистрация:
const registration = (login, password) =>
  actionPromise(
    "registration",
    gql(
      `mutation registration ($login:String, $password: String) {
    UserUpsert (user: {login: $login, password: $password}) {
      _id createdAt
    }
  }`,
      { login: login, password: password }
    )
  );

//логин:
const loginUser = (login, password) =>
  actionPromise(
    "login",
    gql(
      `query log($login: String, $password: String) {
      login(login: $login, password: $password)
      }`,
      { login, password }
    )
  );

//история:
const historyOfOrders = () =>
  actionPromise(
    "historyOfOrders",
    gql(
      `query historyOfOrders ($q: String) {
      OrderFind(query: $q) {
        _id
        total
        createdAt
        orderGoods {
          good {
            name
          }
          price
          count
          total
        }
        total
      }
    }`,
      { q: JSON.stringify([{}]) }
    )
  );

store.dispatch(actionRootCats());

//создание заказа:
const NewOrder = (orderGoods) =>
  actionPromise(
    "NewOrder",
    gql(
      `mutation NewOrder($order: OrderInput) {
        OrderUpsert(order: $order) {
          _id
          orderGoods {
            _id
            price
            count
            total
            good {
              name
              _id
              price
              images {
                url
              }
            }
          }
        }
      }`,
      { order: { orderGoods } }
    )
  );

//отрисовка категорий в aside:
store.subscribe(() => {
  const { status, payload, error } = store.getState().promise.rootCats;
  if (status === "PENDING") {
    main.innerHTML = `<img src='https://media.tenor.com/8ZhQShCQe9UAAAAC/loader.gif' />`;
  }
  if (status === "FULFILLED") {
    aside.innerHTML = "";
    for (const { _id, name } of payload) {
      aside.innerHTML += `<a href= "#/category/${_id}">${name}</a>`;
    }
  }
});

//отрисовка товаров в категории:
store.subscribe(() => {
  const { status, payload, error } =
    store.getState().promise?.oneCatWithGoods || {};
  const [, route] = location.hash.split("/");
  if (route !== "category") {
    return;
  }

  if (status === "PENDING") {
    main.innerHTML = `<img src='https://media.tenor.com/8ZhQShCQe9UAAAAC/loader.gif' />`;
  }

  if (status === "FULFILLED") {
    main.innerHTML = "";

    const { name, goods, subCategories } = payload;
    main.innerHTML = `<h1>${name}</h1>`;

    if (subCategories !== null) {
      for (const { _id, name } of subCategories) {
        main.innerHTML += `<a href= "#/category/${_id}">${name}</a>`;
      }
    }

    for (const { _id, name, price, images } of goods) {
      for (const img of images) {
        main.innerHTML += `<img src= "${url + img.url}"> </br>`;
      }
      main.innerHTML += `<a href= "#/good/${_id}">${name} </br> ${price} денег</a>`;
    }
  }
});

//отрисовка товара:
store.subscribe(() => {
  const { status, payload, error } =
    store.getState().promise?.goodWithDescAndImg || {};
  const [, route] = location.hash.split("/");
  if (route !== "good") {
    return;
  }

  if (status === "PENDING") {
    main.innerHTML = `<img src='https://media.tenor.com/8ZhQShCQe9UAAAAC/loader.gif' />`;
  }

  if (status === "FULFILLED") {
    main.innerHTML = "";
    const { name, description, images, price } = payload;
    main.innerHTML = `<h1>${name}</h1>`;
    for (const img of images) {
      main.innerHTML += `<img src= "${url + img.url}">`;
    }
    main.innerHTML += `<p>${description}</p>
        <p>${price} денег</p> 
        <button id="buy">Купить</button>`;

    const buyBtn = document.getElementById("buy");

    cartIcon.innerHTML = "";
    buyBtn.onclick = function () {
      store.dispatch(actionCartAdd({ _id: name, price: price, img: images }));
    };
  }
});

//отрисовка цифры в корзине:
store.subscribe(() => {
  const { cart } = store.getState();
  let summ = 0;
  for (const { count } of Object.values(cart)) {
    summ += +count;
  }
  cartIcon.innerHTML = `<b>${summ}</b>`;
});

//логин:
const logInBtn = document.getElementById("logIn");
logInBtn.onclick = () => (location.href = `#/login`);

const actionFullLogin = (login, password) => async (dispatch) => {
  const token = await dispatch(loginUser(login, password));

  if (typeof token === "string") {
    dispatch(actionAuthLogin(token));
    main.innerHTML = `<h1>Вы вошли на сайт</h1>`;
  } else {
    main.innerHTML = `<h1>Вы ввели неправильные логин или пароль. Повторите попытку ещё раз</h1>
    <button id="btnRepeat">Повторить попытку</button>`;

    const btnRepeatReg = document.getElementById("btnRepeat");
    btnRepeatReg.onclick = () => {
      location.reload();
      location.href = `#/login`;
    };
  }
};

//при логинизации на сайте:
store.subscribe(() => {
  if (!store.getState().auth) return;
  const { payload } = store.getState().auth;
  if (payload) {
    loginForm.innerHTML = `
      <h1 id="greeting">Поздравляем! Вы вошли на сайт! </h1>
      <button id="ordersLink">Мои Заказы</button>
          <button id="log_out">Выйти с сайта</button>`;

    logInBtn.hidden = true;
    regUser.hidden = true;

    const ordersLinkBtn = document.getElementById("ordersLink");
    ordersLinkBtn.onclick = function () {
      location.href = `#/history`;
    };
    const log_outBtn = document.getElementById("log_out");
    log_outBtn.onclick = function () {
      store.dispatch(actionAuthLogout());
      main.innerHTML = ` `;
      loginForm.innerHTML = ` `;
      logInBtn.hidden = false;
      regUser.hidden = false;
    };
  }
});

//регистрация:
const regUserBtn = document.getElementById("regUser");
regUserBtn.onclick = () => (location.href = `#/register`);

const actionFullRegister = (login, password) => async (dispatch) => {
  let userReg = await dispatch(registration(login, password));

  if (userReg) {
    dispatch(actionFullLogin(login, password));
  } else {
    main.innerHTML = `<h1>Регистрация не удалась. Повторите попытку ещё раз.</h1>
      <button id="btnRepeat">Повторить попытку</button>`;

    const btnRepeatReg = document.getElementById("btnRepeat");
    btnRepeatReg.onclick = () => {
      location.reload();
      location.href = `#/register`;
    };
  }
};

//заказ:
const newOrder = () => async (dispatch, getState) => {
  let { cart } = getState();
  const orderGoods = Object.entries(cart).map(([_id, { count }]) => ({
    good: { _id },
    count,
  }));

  let result = await dispatch(NewOrder(orderGoods));
  if (result?._id) {
    dispatch(actionCartClear());
  }
};

//корзиночка миленькая моя:
store.subscribe(() => {
  let cartBtn = document.getElementById("cartIcon");
  cartBtn.onclick = function myCart() {
    if (Object.keys(store.getState().cart).length === 0) {
      main.innerHTML = `<h1>Ваша корзин пустая</h1>`;
    } else if (Object.keys(store.getState().cart).length !== 0) {
      location.href = `#/cart`;
      console.log(store.getState().cart);

      let storeCart = store.getState().cart;
      main.innerHTML = `<h1>Корзина</h1>`;

      for (let i = 0; i < Object.keys(storeCart).length; i++) {
        let div = document.createElement("div");
        div.id = i;
        main.append(div);
        let order = document.getElementById(i);

        let name = Object.keys(storeCart)[i];

        order.innerHTML += `<p>${store.getState().cart[name].good._id}</p>`;

        for (const img of store.getState().cart[name].good.img) {
          order.innerHTML += `<p><img src= "${url + img.url}"></p>`;
        }

        order.innerHTML += `<p>${store.getState().cart[name].count} шт</p>
    <p>Итого: ${
      store.getState().cart[name].count * store.getState().cart[name].good.price
    } денег </p>`;

        let input = document.createElement("input");
        input.type = "number";
        input.value = store.getState().cart[name].count;
        order.append(input);

        let divForBtn = document.createElement("div");
        order.append(divForBtn);
        let button = document.createElement("button");
        button.id = "delCartBtn";
        button.innerText = "Удалить товар";
        divForBtn.append(button);

        input.oninput = function () {
          if (input.value <= 0) {
            store.dispatch(actionCartDel({ _id: name }));
            myCart();
          }
          console.log(input.value, name);

          store.dispatch(
            actionCartSet(
              {
                _id: name,
                price: store.getState().cart[name].good.price,
                img: store.getState().cart[name].good.img,
              },
              input.value
            )
          );
          myCart();
        };

        button.onclick = function () {
          store.dispatch(actionCartDel({ _id: name }));
          myCart();
        };
      }

      let btnCreateOrder = document.createElement("button");
      btnCreateOrder.id = "createOrder";
      btnCreateOrder.innerText = "Оформить заказ";
      main.append(btnCreateOrder);

      const idCreateOrderBtn = document.getElementById("createOrder");

      if (Object.keys(store.getState().auth).length === 0) {
        idCreateOrderBtn.disabled = true;
      }

      if (Object.keys(store.getState().cart).length !== 0) {
        idCreateOrderBtn.onclick = function () {
          store.dispatch(newOrder());
          store.dispatch(actionCartClear());
          myCart();
        };
      }
    }
  };
});

//история заказов:
store.subscribe(() => {
  const { status, payload, error } =
    store.getState().promise?.historyOfOrders || {};
  const [, route] = location.hash.split("/");
  if (route !== "history") {
    return;
  }

  if (status === "PENDING") {
    main.innerHTML = `<img src='https://media.tenor.com/8ZhQShCQe9UAAAAC/loader.gif' />`;
  }

  if (status === "FULFILLED") {
    main.innerHTML = `<h1>История заказов:</h1>`;
    const { _id, total } = payload;
    console.log(payload);

    for (const order of payload) {
      const { _id, total } = order;
      main.innerHTML += `<div style="width: 300px; border:  solid grey; margin-top: 5px; padding-left: 15px;">
            <p>Номер заказа: ${_id}</p>
                <p>Всего: ${total} денег </p>
            </div>  
            `;
    }
  }
});

window.onhashchange = () => {
  const [, route, _id] = location.hash.split("/");

  const routes = {
    category() {
      store.dispatch(oneCatWithGoods(_id));
    },

    good() {
      store.dispatch(goodWithDescAndImg(_id));
    },

    login() {
      main.innerHTML = `<h2 id="inputTitle">Вход на сайт:</h2>
        <input id="loginInput" type="text" name="login" placeholder="Введите логин">
        <input id="passwordInput" type="password" name="password" placeholder="Введите пароль">
        <button id="sign_in">Войти</button>`;

      const sign_inBtn = document.getElementById("sign_in");
      sign_inBtn.onclick = function () {
        store.dispatch(actionFullLogin(loginInput.value, passwordInput.value));
      };
    },

    register() {
      main.innerHTML = `<h2>Регистрация:</h2>
        <input id="loginReg" type="text" name="login" placeholder="Введите логин">
        <input id="passwordReg" type="password" name="password" placeholder="Введите пароль">
        <button id="reg">Зарегистрироваться</button>`;
      const regBtn = document.getElementById("reg");

      regBtn.onclick = function () {
        store.dispatch(actionFullRegister(loginReg.value, passwordReg.value));
      };
    },

    cart() {},

    history() {
      store.dispatch(historyOfOrders());
    },
  };

  if (route in routes) {
    routes[route]();
  }
};

window.onhashchange();
