extends Container
@onready var colorRect = $ColorRect


var top_margin: float = 20.0 # how far below the very top edge

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	fit_child_in_rect(colorRect, Rect2(Vector2.ZERO, size))

	# set mouse position to top center

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass

# Re-fit whenever the Container itself gets resized
func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		fit_child_in_rect(colorRect, Rect2(Vector2.ZERO, size))
