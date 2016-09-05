(function() {
	var cwhApp = angular.module('cwhApp');
	cwhApp.controller("PrintablesController", ['$scope', '$http', '$location', '$uibModal', '$anchorScroll', 'cwhWebSocket', function ($scope, $http, $location, $uibModal, $anchorScroll, cwhWebSocket) {
		controller = this;
		
		this.externalState = Math.random();//This state has the potential to wipe out the entire cache of the underlying system
		this.currentPrintable = null;
		this.currentCustomizer = null;
		this.currentPrinter = null;
		this.supportedFileTypes = null;
		this.currentPreviewImg = null;
		this.errorMsg = null;
		this.projectImage = false;
		
		this.handlePreviewError = function handlePreviewError() {
			var printableName = encodeURIComponent(controller.currentPrintable.name);
			var printableExtension = encodeURIComponent(controller.currentPrintable.extension);
			$http.get("/services/customizers/renderPreviewImage/" + controller.currentCustomizer.name + "?_=" + controller.currentCustomizer.cacheId).success(
				function (data) {
					controller.errorMsg = null;
				}).error(
				function (data, status, headers, config, statusText) {
					controller.errorMsg = data;
				});
		}

		this.saveCustomizer = function saveCustomizer() {
			if (controller.currentPrintable != null && controller.currentCustomizer != null) {
				$http.post("/services/customizers/upsert", controller.currentCustomizer).success(function (data) {
						controller.currentPreviewImg = "/services/customizers/renderPreviewImage/" + controller.currentCustomizer.name + "?_=" + data.cacheId;
					}).error(function (data, status, headers, config, statusText) {
 	        			$scope.$emit("HTTPError", {status:status, statusText:data});
	        		});
			}
		};

		this.changeCurrentPrintable = function changeCurrentPrintable(newPrintable) {
			var newCustomizerName = newPrintable.name + "." + newPrintable.extension + "." + controller.currentPrinter.configuration.name;
			if (controller.currentPrintable != null && newPrintable.name == controller.currentPrintable.name && newPrintable.extension == controller.currentPrintable.extension) {
				return;
			}
			
			controller.currentPrintable = newPrintable;
			controller.errorMsg = null;
			$http.get("services/customizers/get/" + newCustomizerName + "?externalState=" + controller.externalState).success(
					function (data) {
						if (data == "") {
							controller.currentCustomizer = {
									name: newCustomizerName,
									printerName: controller.currentPrinter.configuration.name,
									printableName: newPrintable.name,
									printableExtension: newPrintable.extension,
									supportsAffineTransformSettings: true,
									externalImageAffectingState:controller.externalState,
									affineTransformSettings: {
										xscale: 1,
										yscale: 1,
										rotation:0,
										xtranslate: 0,
										ytranslate: 0
									}
								};
						} else {
							controller.currentCustomizer = data;
							controller.currentCustomizer.externalImageAffectingState = controller.externalState;
						}
						
						//We probably don't need to save the customizer here but we do it in case the externalState changed
						controller.saveCustomizer();
					});
		};

		this.refreshPrintables = function refreshPrintables() {
	  		$http.get("services/printables/list").success(
	  			function (data) {
	  				controller.printables = data;
	  			})
		};
		
		this.refreshCurrentPrinter = function refreshCurrentPrinter() {
			$http.get("services/printers/getFirstAvailablePrinter").success(
	  			function (data) {
	  				controller.currentPrinter = data;
	  			});
		};

		this.hostSocket = cwhWebSocket.connect("services/hostNotification", $scope).onJsonContent(
			function(data) {
				if (data.notificationEvent == "FileUploadComplete") {
					controller.refreshPrintables();
				}
			}
			// potentially add one for when customizerischanged to reset the preview again (this is the whole preview/customizer thing goes into a separate controller or somethng like that)
		);
		if (this.hostSocket === null) {
			$scope.$emit("MachineResponse",  {machineResponse: {command:"Browser Too Old", message:"You will need to use a modern browser to run this application."}});
		}

		this.printWithCustomizer = function printWithCustomizer() {
			var customizerName = encodeURIComponent(controller.currentCustomizer.name);
	        $http.post("/services/printers/startJob/" + customizerName).success(
	        		function (data) {
	        	        $location.path("/printJobsPage")
	        		}).error(
    				function (data, status, headers, config, statusText) {
 	        			$scope.$emit("HTTPError", {status:status, statusText:data});
	        		})
		}

		this.flipY = function flipY() {
			var incrementor = controller.currentPrinter.configuration.machineConfig.MonitorDriverConfig.DLP_Y_Res;
			if (controller.currentCustomizer.affineTransformSettings.yscale < 0) {
				incrementor *= -1;
			}
			controller.currentCustomizer.affineTransformSettings.ytranslate += incrementor;			
			controller.currentCustomizer.affineTransformSettings.yscale = -controller.currentCustomizer.affineTransformSettings.yscale;
			this.saveCustomizer();
		}
		
		this.flipX = function flipX() {
			var incrementor = controller.currentPrinter.configuration.machineConfig.MonitorDriverConfig.DLP_X_Res;
			if (controller.currentCustomizer.affineTransformSettings.xscale < 0) {
				incrementor *= -1;
			}
			controller.currentCustomizer.affineTransformSettings.xtranslate += incrementor;			
			controller.currentCustomizer.affineTransformSettings.xscale = -controller.currentCustomizer.affineTransformSettings.xscale;
			this.saveCustomizer();
		}
		
		this.changeScale = function changeScale(x, y) {	
			controller.currentCustomizer.affineTransformSettings.xscale += x;
			controller.currentCustomizer.affineTransformSettings.yscale += y;
			if (controller.currentCustomizer.affineTransformSettings.xscale == 0) {
				controller.currentCustomizer.affineTransformSettings.xscale = .01;
			}
			if (controller.currentCustomizer.affineTransformSettings.yscale == 0) {
				controller.currentCustomizer.affineTransformSettings.yscale = .01;
			}
			this.saveCustomizer();
		}
		
		this.changeRotation = function changeRotation(rotation) {
			controller.currentCustomizer.affineTransformSettings.rotation += rotation;
			this.saveCustomizer();
		}
		
		this.setProjectImage = function setProjectImage(projectImage) {
			controller.projectImage = projectImage;
			if (projectImage) {
				$http.get("services/customizers/projectCustomizerOnPrinter/" + encodeURIComponent(controller.currentCustomizer.name));
			} else {
				$http.get("services/printers/showBlankScreen/" + encodeURIComponent(controller.currentPrinter.configuration.name));
			}
		}

		this.resetTranslation = function resetTranslation() {
			var affineTransformSettings = controller.currentCustomizer.affineTransformSettings;
			affineTransformSettings.xtranslate = 0;
			affineTransformSettings.ytranslate = 0;
			affineTransformSettings.xscale = 1.0;
			affineTransformSettings.yscale = 1.0;
			affineTransformSettings.rotation = 0;
			this.saveCustomizer();
		}

		this.goToSlacer = function goToSlacer() {
			window.open("/slacer", "slacer");
		}

		this.changeTranslate = function changeTranslate(x, y) {
			var affineTransformSettings = controller.currentCustomizer.affineTransformSettings;

			affineTransformSettings.xtranslate += x;
			affineTransformSettings.ytranslate += y;
			this.saveCustomizer();
		}

		this.printPrintable = function printPrintable() {
			var printableName = encodeURIComponent(controller.currentPrintable.name + "." + controller.currentPrintable.extension);
	        $http.post("/services/printables/print/" + printableName).success(
	        		function (data) {
	        			$location.path("/printJobsPage");
	        		}).error(
    				function (data, status, headers, config, statusText) {
 	        			$scope.$emit("HTTPError", {status:status, statusText:data});
	        		})
		};
		
		this.deletePrintable = function deletePrintable() {
			var printableName = encodeURIComponent(controller.currentPrintable.name);
			var printableExtension = encodeURIComponent(controller.currentPrintable.extension);
			var fileName = printableName + "." + printableExtension;
			var customizerName = encodeURIComponent(controller.currentPrintable.name);
	        $http.delete("/services/printables/delete/" + fileName).success(function (data) {
	        			$http.delete("services/customizers/delete/" + customizerName).success(function (data) {			
	        				    controller.refreshPrintables();
	        					controller.currentPrintable = null;
	        					controller.currentCustomizer = null;
        				}).error(function (data, status, headers, config, statusText) {
        					$scope.$emit("HTTPError", {status:status, statusText:data});
        				})
    		}).error(function (data, status, headers, config, statusText) {
    			$scope.$emit("HTTPError", {status:status, statusText:data});
    		})
	    };
	    
		//TODO: When we get an upload complete message, we need to refresh file list...
		this.showUpload = function showUpload() {
			var fileChosenModal = $uibModal.open({
		        animation: true,
		        templateUrl: 'upload.html',
		        controller: 'UploadFileController',
		        size: "lg",
		        resolve: {
		        	title: function () {return "Upload Printable";},
		        	supportedFileTypes: function () {return null},
		        	getRestfulFileUploadURL: function () {return function (filename) {return '/services/printables/uploadPrintableFile/' + encodeURIComponent(filename);}},
		        	getRestfulURLUploadURL: function () {return function (filename, url) {return "services/printables/uploadviaurl/" + encodeURIComponent(filename) + "/" + encodeURIComponent(url);}}
		        }
			});
			
			fileChosenModal.result.then(function (uploadedPrintable) {this.refreshPrintables()});
		};
	  			
		this.getPrintableIconClass = function getPrintableIconClass(printable) {
			if (printable.printFileProcessor.friendlyName === 'Image') {
				return "fa-photo";
			}
			if (printable.printFileProcessor.friendlyName === 'Maze Cube') {
				return "fa-cube";
			}			
			if (printable.printFileProcessor.friendlyName === 'STL 3D Model') {
				return "fa-object-ungroup";
			}			
			if (printable.printFileProcessor.friendlyName === 'Creation Workshop Scene') {
				return "fa-diamond";
			}
			if (printable.printFileProcessor.friendlyName === 'Zip of Slice Images') {
				return "fa-stack-overflow";
			}
			if (printable.printFileProcessor.friendlyName === 'Simple Text') {
				return "fa-bold";
			}
			if (printable.printFileProcessor.friendlyName === 'Scalable Vector Graphics') {
				return "fa-puzzle-piece";
			}
			return "fa-question-circle";
		};//*/

		this.refreshPrintables();
		this.refreshCurrentPrinter();
	}]);


	cwhApp.directive('handleError', function() {
			return {
				link: function(scope, element, attrs) {
					
					var pc = scope.printablesController;
					element.bind('error', function() {
						pc.handlePreviewError();
						scope.$apply();
					});

				}
			};
		});
})();
