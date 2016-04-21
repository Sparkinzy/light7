// jshint ignore: start
/*
 * 路由器
 */
+function ($) {
  "use strict";

  if (!window.CustomEvent) {
    window.CustomEvent = function (type, config) {
      var e = document.createEvent('CustomEvent');
      e.initCustomEvent(type, config.bubbles, config.cancelable, config.detail, config.id);
      return e;
    };
  }

  var Router = function() {
    this.state = sessionStorage;
    this.state.setItem("stateid", parseInt(this.state.getItem("stateid") || 1)+1);
    this.state.setItem("currentStateID", this.state.getItem("stateid"));
    this.stack = sessionStorage;
    this.stack.setItem("back", "[]");  //返回栈, {url, pageid, stateid}
    this.stack.setItem("forward", "[]");  //前进栈, {url, pageid, stateid}
    this.extras = {}; //page extra: popup, panel...
    this.init();
    this.xhr = null;
  }

  Router.prototype.defaults = {
    transition: true
  };

  Router.prototype.init = function() {
    var currentPage = this.getCurrentPage();
    if(!currentPage[0]) currentPage = $(".page").eq(0).addClass("page-current");
    var hash = location.hash;
    if(currentPage[0] && !currentPage[0].id) currentPage[0].id = (hash ? hash.slice(1) : this.genRandomID());

    if(!currentPage[0]) throw new Error("can't find .page element");
    var newCurrentPage = $(hash);


    if(newCurrentPage[0] && (!currentPage[0] || hash.slice(1) !== currentPage[0].id)) {
      currentPage.removeClass("page-current");
      newCurrentPage.addClass("page-current");
      currentPage = newCurrentPage;
    }

    //第一次加载的时候，初识话当前页面的state
    var state = history.state;
    if(!state) {
      var id = this.genStateID();
      this.replaceState(location.href, id);
      this.setCurrentStateID(id);
    }


    var self = this;
    window.addEventListener('load', function() {
      //解决safari的一个bug，safari会在首次加载页面的时候触发 popstate 事件，通过setTimeout 做延迟来忽略这个错误的事件。
      //参考 https://github.com/visionmedia/page.js/pull/239/files
      setTimeout(function() {
        window.addEventListener('popstate', $.proxy(self.onpopstate, self));
      }, 0);
    }, false);
  }

  //load new page, and push to history
  Router.prototype.loadPage = function(url, noAnimation, replace, reload) {

    var param = url;

    if(noAnimation === undefined) {
      noAnimation = !this.defaults.transition;
    }

    if(typeof url === typeof "a") {
      param = {
        url: url,
        noAnimation: noAnimation,
        replace: replace
      }
    }

    var url = param.url, noAnimation = param.noAnimation, replace = param.replace;

    this.getPage(url, function(page, extra) {

      var currentPage = this.getCurrentPage();

      var pageid = currentPage[0].id;

      var action = "pushBack";
      if(replace) action = "replaceBack";
      if(reload) action = "reloadBack";
      this[action]({
        url: location.href,
        pageid: "#"+ pageid,
        id: this.getCurrentStateID(),
        animation: !noAnimation
      });


      //remove all forward page
      var forward = JSON.parse(this.state.getItem("forward") || "[]");
      var self = this;
      for(var i=0;i<forward.length;i++) {
        $(forward[i].pageid).each(function() {
          var $page = $(this);
          if($page.data("page-remote")) {
            self.removePageDom($page);
          }
        });
      }
      this.state.setItem("forward", "[]");  //clearforward

      var duplicatePage = $("#"+$(page)[0].id);

      page.insertAfter(currentPage);

      if(duplicatePage[0] !== page[0]) duplicatePage.remove(); //if inline mod, the duplicate page is current page

      if(extra) self.extras[page[0].id] = extra.appendTo(document.body);

      var id = this.genStateID();
      this.setCurrentStateID(id);

      this[replace || reload ? "replaceState" : "pushState"](url, id);

      this.forwardStack  = [];  //clear forward stack
      
      this.animatePages(this.getCurrentPage(), page, null, noAnimation);
    });
  }

  Router.prototype.removePageDom = function($page) {
    var pageExtra = this.extras[$page[0].id];
    pageExtra && pageExtra.remove();
    this.extras[$page[0].id] = undefined;
    $page.remove();
  }

  //load new page and replace current page inhistory
  Router.prototype.replacePage = function(url, noAnimation) {
    return this.loadPage(url, noAnimation, true);
  }

  //reload current page
  Router.prototype.reloadPage = function() {
    return this.loadPage(location.href, true, false, true);
  }

  Router.prototype.reloadPrevPage = function() {
    var stack = this.getStack();
    if(!stack.back || !stack.back.length) return false;
    var prev = stack.back[stack.back.length-1];
    var prevPage = $(prev.pageid);
    if(!prevPage[0]) return false;
    var self = this;
    var bak = $.smConfig.showPageLoadingIndicator;
    $.smConfig.showPageLoadingIndicator = false;
    this.getPage(prev.url, function(page, extra) {
      self.removePageDom(prevPage);
      page.removeClass("page-current");
      page.insertBefore(self.getCurrentPage());
      page.trigger("pageInitInternal", [prev.pageid, page]);
      if(extra) self.extras[prev.id] = extra.appendTo(document.body);
      $.smConfig.showPageLoadingIndicator = bak;
    });
  }

  Router.prototype.animatePages = function (leftPage, rightPage, leftToRight, noTransition) {
    var removeClasses = 'page-left page-right page-from-center-to-left page-from-center-to-right page-from-right-to-center page-from-left-to-center';
    if(noTransition) {
      if (!leftToRight) {
        rightPage.trigger("pageAnimationStart", [rightPage[0].id, rightPage]);
        leftPage.removeClass(removeClasses).removeClass('page-current');
        rightPage.removeClass(removeClasses).addClass("page-current");
        rightPage.trigger("pageInitInternal", [rightPage[0].id, rightPage]);

        if(rightPage.hasClass("no-tabbar")) {
          $(document.body).addClass("tabbar-hidden");
        } else {
          $(document.body).removeClass("tabbar-hidden");
        }
      } else {
        leftPage.trigger("pageAnimationStart", [rightPage[0].id, rightPage]);
        rightPage.removeClass(removeClasses).removeClass('page-current');
        leftPage.removeClass(removeClasses).addClass("page-current");

        if(leftPage.hasClass("no-tabbar")) {
          $(document.body).addClass("tabbar-hidden");
        } else {
          $(document.body).removeClass("tabbar-hidden");
        }
        rightPage.trigger("pageInitInternal", [leftPage[0].id, leftPage]);
      }
    } else {
      if (!leftToRight) {
        rightPage.trigger("pageAnimationStart", [rightPage[0].id, rightPage]);
        leftPage.removeClass(removeClasses).addClass("page-from-center-to-left").removeClass('page-current');
        rightPage.removeClass(removeClasses).addClass("page-from-right-to-center page-current");

        leftPage.animationEnd(function() {
          leftPage.removeClass(removeClasses);
        });
        rightPage.animationEnd(function() {
          afterAnimation(rightPage);
        });

        if(rightPage.hasClass("no-tabbar")) {
          $(document.body).addClass("tabbar-hidden");
        } else {
          $(document.body).removeClass("tabbar-hidden");
        }
        rightPage.trigger("pageInitInternal", [rightPage[0].id, rightPage]);
      } else {
        leftPage.trigger("pageAnimationStart", [rightPage[0].id, rightPage]);
        rightPage.removeClass(removeClasses).addClass("page-from-center-to-right").removeClass('page-current');
        leftPage.removeClass(removeClasses).addClass("page-from-left-to-center page-current");

        leftPage.animationEnd(function() {
          afterAnimation(leftPage);
        });
        rightPage.animationEnd(function() {
          rightPage.removeClass(removeClasses);
        });
        if(leftPage.hasClass("no-tabbar")) {
          $(document.body).addClass("tabbar-hidden");
        } else {
          $(document.body).removeClass("tabbar-hidden");
        }
        rightPage.trigger("pageInitInternal", [leftPage[0].id, leftPage]);
      }

      this.currentState = {
        url: location.href,
        pageid: "#"+ (leftToRight ? leftPage.attr("id") : rightPage.attr("id")),
        id: this.getCurrentStateID(),
        animation: !noTransition
      }
    }

    function afterAnimation(page) {
      page.removeClass(removeClasses);
      page.trigger("pageAnimationEnd", [page[0].id, page]);
    }

  }
  Router.prototype.getCurrentPage = function () {
    return $(".page-current");
  }
  Router.prototype.getStack = function () {
    var back = JSON.parse(this.stack.getItem("back"));
    var forward = JSON.parse(this.stack.getItem("forward"));
    return {
      back: back,
      forward: forward
    };
  }
  //如果无法前进，则加载对应的url
  Router.prototype.forward = function(url, step) {
    var stack = JSON.parse(this.stack.getItem("forward"));
    step = step || 1;
    if(stack.length) {
      this._forwardStep = step;
      history.go(step);
    } else {
      location.href = url;
    }
  }
  //如果无法后退，则加载对应的url
  Router.prototype.back = function(url, step) {
    var stack = JSON.parse(this.stack.getItem("back"));
    step = step || 1;
    if(stack.length) {
      this._backStep = step;
      history.go(-step);
    } else if(url) {
      location.href = url;
    } else {
      history.back();
    }
  }

  //后退
  Router.prototype._back = function(step) {
    step = step || 1;
    var h = this.popBack(step);
    if(!h) {
      //可能是由于刷新页面而丢掉了信息，此时只能进行一次刷新
      location.reload();
      return;
    }
    var currentPage = this.getCurrentPage();
    var newPage = $(h.pageid);
    if(!newPage[0]) return;
    this.setCurrentStateID(h.id);
    this.animatePages(newPage, currentPage, true, !h.animation);
  }

  //前进
  Router.prototype._forward = function(step) {
    step = step || 1;
    var h = this.popForward(step);
    if(!h) return;
    var currentPage = this.getCurrentPage();
    var newPage = $(h.pageid);
    if(!newPage[0]) return;
    this.setCurrentStateID(h.id);
    this.animatePages(currentPage, newPage, false, !h.animation);
  }

  Router.prototype.pushState = function(url, id) {
    history.pushState({url: url, id: id}, '', url);
  }

  Router.prototype.replaceState = function(url, id) {
    history.replaceState({url: url, id: id}, '', url);
  }

  Router.prototype.onpopstate = function(d) {
    var state = d.state;
    if(!state) {
      return true;
    }

    if(state.id === this.getCurrentStateID()) {
      return false;
    }
    var forward = state.id > this.getCurrentStateID();
    if(forward) this._forward(this._forwardStep);
    else this._back(this._backStep);
    this._backStep = 1;
    this._forwardStep = 1;
    this._printStack();
  }


  //根据url获取页面的DOM，如果是一个内联页面，则直接返回，否则用ajax加载
  Router.prototype.getPage = function(url, callback) {
    if(url[0] === "#") return callback.apply(this, [$(url)]);

    this.dispatch("pageLoadStart");

    if(this.xhr && this.xhr.readyState < 4) {
      this.xhr.onreadystatechange = $.noop;
      this.xhr.abort();
      this.dispatch("pageLoadCancel");
    }

    var self = this;

    this.xhr = $.ajax({
      url: url,
      success: $.proxy(function(data, s, xhr) {
        var html = this.parseXHR(xhr);
        var $page = html[0];
        var $extra = html[1];
        if(!$page[0].id) $page[0].id = this.genRandomID();
        $page.data("page-remote", 1);
        callback.apply(this, [$page, $extra]);
      }, this),
      error: function() {
        self.dispatch("pageLoadError");
      },
      complete: function() {
        self.dispatch("pageLoadComplete");
      }
    });
  }
  Router.prototype.parseXHR = function(xhr) {
    var response = xhr.responseText;
    var body = response.match(/<body[^>]*>([\s\S.]*)<\/body>/i);
    var html = body ? body[1] : response;
    html = "<div>"+html+"</div>";
    var tmp = $(html);

    var $extra = tmp.find(".popup, .popover, .panel, .panel-overlay");

    var $page = tmp.find(".page");
    if(!$page[0]) $page = tmp.addClass("page");
    return [$page, $extra];
  }

  Router.prototype.genStateID = function() {
    var id = parseInt(this.state.getItem("stateid")) + 1;
    this.state.setItem("stateid", id);
    return id;
  }
  Router.prototype.getCurrentStateID = function() {
    return parseInt(this.state.getItem("currentStateID"));
  }
  Router.prototype.setCurrentStateID = function(id) {
    this.state.setItem("currentStateID", id);
  }
  Router.prototype.genRandomID = function() {
    return "page-"+(+new Date());
  }

  Router.prototype.popBack = function(step) {
    step = step || 1;
    var stack = JSON.parse(this.stack.getItem("back"));
    if(!stack.length || stack.length < step) return null;
    
    /**
     * 注意这个逻辑: back, current, forward
     * 所以back里面pop出来的应该进入current，而不是直接进入forward
     */
    var h, last;
    while(step-- > 0) {
      h = stack.pop();
      if(!last) {
        var currentPage = this.getCurrentPage();
        this.pushForward(this.currentState);
      } else {
        this.pushForward(last);
      }
      last = h;
    }
    this.stack.setItem("back", JSON.stringify(stack));
    return h;
  }
  Router.prototype.pushBack = function(h) {
    var stack = JSON.parse(this.stack.getItem("back"));
    stack.push(h);
    this.stack.setItem("back", JSON.stringify(stack));
  }
  Router.prototype.replaceBack = function(h) {
    var stack = JSON.parse(this.stack.getItem("back"));
    stack.pop();
    stack.push(h);
    this.stack.setItem("back", JSON.stringify(stack));
  }
  Router.prototype.reloadBack = function(h) {
    //do nothing;
    return;
  }
  Router.prototype.popForward = function(step) {
    step = step || 1;
    var stack = JSON.parse(this.stack.getItem("forward"));
    if(!stack.length || stack.length < step) return null;

    var h, last;
    while(step-- > 0) {
      h = stack.pop();
      if(!last) {
        var currentPage = this.getCurrentPage();
        this.pushBack(this.currentState);
      } else {
        this.pushBack(last);
      }
      last = h;
    }
    
    this.stack.setItem("forward", JSON.stringify(stack));
    return h;
  }
  Router.prototype.pushForward = function(h) {
    var stack = JSON.parse(this.stack.getItem("forward"));
    stack.push(h);
    this.stack.setItem("forward", JSON.stringify(stack));
  }

  Router.prototype.dispatch = function (event) {
    var e = new CustomEvent(event, {
      bubbles: true,
      cancelable: true
    });

    window.dispatchEvent(e);
  };

  Router.prototype._printStack = function () {
    console.log(this.stack.getItem("back"));
    console.log(this.stack.getItem("forward"));
  }

  $(function() {
    if(!$.smConfig.router) return;

    var router = $.router = new Router();
    router.defaults = Router.prototype.defaults;

    $(document).on("click", "a", function(e) {
      var $target = $(e.currentTarget);
      if($target.hasClass("external") ||
         $target[0].hasAttribute("external") ||
         $target.hasClass("tab-link") ||
         $target.hasClass("open-popup") ||
         $target.hasClass("open-panel")
        ) return;
      e.preventDefault();
      var url = $target.attr("href");
      if($target.hasClass("back")) {
        var step = $target.attr("data-back-step");
        if(step) step = parseInt(step);
        step = step || 1;
        router.back(url, step);
        return;
      }

      if(!url || url === "#" || /^(javascript:|mailto:|tel:).*$/.test(url)) return;
      var noTransition = undefined;
      if($target.hasClass("no-transition")) noTransition = true;
      if($target.hasClass("with-transition")) noTransition = false;
      router.loadPage(url, noTransition, $target.hasClass("replace") ? true : undefined);  //undefined is different to false
    })
  });
}($);
// jshint ignore: end
