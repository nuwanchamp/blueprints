extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 1


# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	StarChart.hide_chart()
	_reveal_button_later()


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass


func _on_check_button_toggled(toggled_on: bool) -> void:
	for ball in get_tree().get_nodes_in_group("balls"):
		ball.set_gravity_enabled(toggled_on)
		
func _reveal_button_later() -> void:
	$CanvasLayer/Control/NextButton.hide()
	await get_tree().create_timer(10.0).timeout
	$CanvasLayer/Control/NextButton.show()


func _on_next_button_pressed() -> void:
	await _award_star()
	get_tree().change_scene_to_file("res://Scenes/unit1-level3.tscn")


func _award_star() -> void:
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
