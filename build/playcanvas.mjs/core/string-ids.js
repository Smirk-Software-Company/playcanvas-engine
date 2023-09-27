/**
 * A cache for assigning unique numerical ids to strings.
 *
 * @ignore
 */
class StringIds {
  constructor() {
    /** @type {Map<string, number>} */
    this.map = new Map();
    /** @type {number} */
    this.id = 0;
  }
  /**
   * Get the id for the given name. If the name has not been seen before, it will be assigned a new
   * id.
   *
   * @param {string} name - The name to get the id for.
   * @returns {number} The id for the given name.
   */
  get(name) {
    let value = this.map.get(name);
    if (value === undefined) {
      value = this.id++;
      this.map.set(name, value);
    }
    return value;
  }
}

export { StringIds };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaW5nLWlkcy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2NvcmUvc3RyaW5nLWlkcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEEgY2FjaGUgZm9yIGFzc2lnbmluZyB1bmlxdWUgbnVtZXJpY2FsIGlkcyB0byBzdHJpbmdzLlxuICpcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgU3RyaW5nSWRzIHtcbiAgICAvKiogQHR5cGUge01hcDxzdHJpbmcsIG51bWJlcj59ICovXG4gICAgbWFwID0gbmV3IE1hcCgpO1xuXG4gICAgLyoqIEB0eXBlIHtudW1iZXJ9ICovXG4gICAgaWQgPSAwO1xuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBpZCBmb3IgdGhlIGdpdmVuIG5hbWUuIElmIHRoZSBuYW1lIGhhcyBub3QgYmVlbiBzZWVuIGJlZm9yZSwgaXQgd2lsbCBiZSBhc3NpZ25lZCBhIG5ld1xuICAgICAqIGlkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSB0byBnZXQgdGhlIGlkIGZvci5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgaWQgZm9yIHRoZSBnaXZlbiBuYW1lLlxuICAgICAqL1xuICAgIGdldChuYW1lKSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IHRoaXMubWFwLmdldChuYW1lKTtcbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5pZCsrO1xuICAgICAgICAgICAgdGhpcy5tYXAuc2V0KG5hbWUsIHZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFN0cmluZ0lkcyB9O1xuIl0sIm5hbWVzIjpbIlN0cmluZ0lkcyIsImNvbnN0cnVjdG9yIiwibWFwIiwiTWFwIiwiaWQiLCJnZXQiLCJuYW1lIiwidmFsdWUiLCJ1bmRlZmluZWQiLCJzZXQiXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxTQUFTLENBQUM7RUFBQUMsV0FBQSxHQUFBO0FBQ1o7QUFBQSxJQUFBLElBQUEsQ0FDQUMsR0FBRyxHQUFHLElBQUlDLEdBQUcsRUFBRSxDQUFBO0FBRWY7SUFBQSxJQUNBQyxDQUFBQSxFQUFFLEdBQUcsQ0FBQyxDQUFBO0FBQUEsR0FBQTtBQUVOO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLEdBQUdBLENBQUNDLElBQUksRUFBRTtJQUNOLElBQUlDLEtBQUssR0FBRyxJQUFJLENBQUNMLEdBQUcsQ0FBQ0csR0FBRyxDQUFDQyxJQUFJLENBQUMsQ0FBQTtJQUM5QixJQUFJQyxLQUFLLEtBQUtDLFNBQVMsRUFBRTtBQUNyQkQsTUFBQUEsS0FBSyxHQUFHLElBQUksQ0FBQ0gsRUFBRSxFQUFFLENBQUE7TUFDakIsSUFBSSxDQUFDRixHQUFHLENBQUNPLEdBQUcsQ0FBQ0gsSUFBSSxFQUFFQyxLQUFLLENBQUMsQ0FBQTtBQUM3QixLQUFBO0FBRUEsSUFBQSxPQUFPQSxLQUFLLENBQUE7QUFDaEIsR0FBQTtBQUNKOzs7OyJ9
